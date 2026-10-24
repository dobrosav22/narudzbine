"""Synthetic local release rehearsal. Never promotes a remote registry or deploys an environment."""
from pathlib import Path
import argparse,concurrent.futures,hashlib,io,json,os,re,subprocess,time,urllib.parse,uuid,zipfile
PG="postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336"
CAPABILITIES=["shared/api/RecoveryContainment.class","shared/infrastructure/recovery/BackupEnvelopeCommand.class","shared/infrastructure/recovery/RecoveryContainmentConfiguration.class"]
def main():
 p=argparse.ArgumentParser(description=__doc__)
 for name in ["candidate","compatible-previous","incompatible-previous"]: p.add_argument("--"+name,required=True)
 p.add_argument("--output",type=Path,required=True);a=p.parse_args()
 ids=[a.candidate,a.compatible_previous,a.incompatible_previous]
 if any(not re.fullmatch(r"sha256:[0-9a-f]{64}",v) for v in ids) or len(set(ids))!=3: p.error("Select three distinct immutable local image IDs")
 if "OPERATIONS_RECOVERY_CONTAINED" in os.environ: p.error("Run only in a separate unpinned synthetic test environment")
 env=dict(os.environ)
 endpoint=env.get("DOCKER_HOST")
 if not endpoint:
  endpoint=subprocess.run(["docker","context","inspect","--format","{{.Endpoints.docker.Host}}"],capture_output=True,text=True,check=True,timeout=15).stdout.strip()
 parsed=urllib.parse.urlparse(endpoint)
 if not ((re.fullmatch(r"npipe:/+\./pipe/[A-Za-z0-9_.-]+",endpoint) is not None or parsed.scheme=="unix" and not parsed.netloc and parsed.path.startswith("/")) or parsed.scheme=="tcp" and parsed.hostname in {"localhost","127.0.0.1","::1"}): p.error("Only a local Docker transport is authorized")
 env.pop("DOCKER_CONTEXT",None);env["DOCKER_HOST"]=endpoint
 def docker(*args,input=None,check=True,timeout=90,binary=False):
  r=subprocess.run(["docker",*args],input=input,capture_output=True,text=not binary,env=env,timeout=timeout)
  if check and r.returncode: raise RuntimeError("Local Docker operation failed; inspect owned resources without logging secret-bearing arguments")
  return r
 if docker("info","--format","{{.OSType}}").stdout.strip()!="linux": raise RuntimeError("Linux Docker required")
 artifacts=[]
 for image in ids:
  record=json.loads(docker("image","inspect",image).stdout)[0]
  assert record["Id"]==image and record["Config"]["User"]=="10001:10001"
  payload=docker("run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--entrypoint","cat",image,"/app/application.jar",binary=True).stdout
  with zipfile.ZipFile(io.BytesIO(payload)) as jar:
   capabilities=all("BOOT-INF/classes/com/narudzbine/"+c in jar.namelist() for c in CAPABILITIES)
  artifacts.append({"localImageConfigId":image,"jarSha256":hashlib.sha256(payload).hexdigest(),"requiredRecoveryCapabilitiesPresent":capabilities,"registryManifestDigest":None})
 assert artifacts[0]["requiredRecoveryCapabilitiesPresent"]
 assert not artifacts[1]["requiredRecoveryCapabilitiesPresent"] and not artifacts[2]["requiredRecoveryCapabilitiesPresent"]
 network="narudzbine-local-release-"+uuid.uuid4().hex[:12];db=network+"-db";owned=[];created=False
 owner=uuid.uuid4().hex;runtime=uuid.uuid4().hex;started=time.monotonic()
 try:
  docker("network","create","--internal",network);created=True
  docker("run","-d","--name",db,"--network",network,"-e","POSTGRES_DB=release_exercise","-e","POSTGRES_PASSWORD="+owner,PG);owned.append(db)
  for _ in range(90):
   if docker("exec",db,"pg_isready","-U","postgres",check=False).returncode==0:break
   time.sleep(.25)
  else:raise RuntimeError("Owned database readiness timeout")
  url="jdbc:postgresql://"+db+":5432/release_exercise"
  common=["--network",network,"--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--tmpfs","/tmp:rw,noexec,nosuid,size=128m","-e","DATABASE_URL="+url]
  def migrate():return docker("run","--rm",*common,"-e","MIGRATION_DATABASE_USERNAME=postgres","-e","MIGRATION_DATABASE_PASSWORD="+owner,ids[0],"--migrate")
  def sql(query):return docker("exec","-i",db,"psql","-U","postgres","-d","release_exercise","-At","-v","ON_ERROR_STOP=1",input=query).stdout.strip()
  migrate();print("Fresh migration passed",flush=True)
  history=sql("SELECT count(*)||':'||count(DISTINCT version)||':'||bool_and(success) FROM flyway_schema_history WHERE version IS NOT NULL;")
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   tasks=[pool.submit(migrate) for _ in range(2)]
   for t in tasks:t.result()
  print("Checking unchanged migration history",flush=True)
  assert history==sql("SELECT count(*)||':'||count(DISTINCT version)||':'||bool_and(success) FROM flyway_schema_history WHERE version IS NOT NULL;")
  assert sql("SELECT version FROM backend_schema_version WHERE id=1;")=="78"
  sql("CREATE ROLE release_runtime LOGIN PASSWORD '"+runtime+"'; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO release_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO release_runtime;")
  observations=[]
  for index,image in enumerate([ids[0],ids[0],ids[1],ids[2]]):
   print("Starting synthetic application index "+str(index),flush=True)
   name=network+"-app-"+str(index);owned.append(name)
   docker("run","-d","--name",name,*common,"-e","DATABASE_USERNAME=release_runtime","-e","DATABASE_PASSWORD="+runtime,"-e","OPERATIONS_ENVIRONMENT=SYNTHETIC-"+str(index),image)
   if index==3:
    for _ in range(120):
     state=json.loads(docker("inspect",name).stdout)[0]["State"]
     if state["Status"]=="exited":break
     time.sleep(.5)
    else:raise RuntimeError("Incompatible image did not stop within bound")
    logs=docker("logs",name,check=False)
    assert state["ExitCode"]!=0 and "Database schema is incompatible with this application" in logs.stdout+logs.stderr
    observations.append({"localImageConfigId":image,"startupRejected":True,"privateReadiness":None,"environment":"SYNTHETIC-"+str(index)})
    docker("rm","-f",name);owned.remove(name)
    continue
   def status(path):
    command="exec 3<>/dev/tcp/127.0.0.1/9091; printf 'GET "+path+" HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3; head -n 1 <&3"
    return docker("exec",name,"bash","-c",command,check=False).stdout.strip()
   for _ in range(100):
    if "200" in status("/actuator/health/liveness"):break
    time.sleep(.4)
   else:
    logs=docker("logs",name,check=False)
    text=(logs.stdout+logs.stderr).replace(owner,"[synthetic-secret]").replace(runtime,"[synthetic-secret]")
    Path(".tools/local-release-startup-failure.log").write_text(text,encoding="utf8")
    raise RuntimeError("Owned app liveness timeout; sanitized startup diagnostics retained")
   ready=status("/actuator/health/readiness");expected="200";assert expected in ready
   observations.append({"localImageConfigId":image,"privateReadiness":int(expected),"environment":"SYNTHETIC-"+str(index)})
   docker("rm","-f",name);owned.remove(name)
  print("Checking unchanged migration history",flush=True)
  assert history==sql("SELECT count(*)||':'||count(DISTINCT version)||':'||bool_and(success) FROM flyway_schema_history WHERE version IS NOT NULL;")
  result={"syntheticOnly":True,"schema":78,"artifacts":artifacts,"freshAndRepeatedConcurrentMigration":True,"immutableImageAcrossTwoConfigurations":True,"observations":observations,"normalApiSchemaCompatiblePreviousReady":True,"wholeReleasePreviousRollbackAllowed":False,"rollbackBlocker":"Previous compatible schema image lacks required recovery capabilities; preserve containment and fix forward","incompatiblePreviousStartupRejected":True,"registryPromotionOrProductionRelease":False,"elapsedSeconds":round(time.monotonic()-started,3)}
 finally:
  for name in reversed(owned):docker("rm","-f",name,check=False)
  if created:docker("network","rm",network,check=False)
  remaining=docker("ps","-a","--format","{{.Names}}").stdout.splitlines()
  networks=docker("network","ls","--format","{{.Name}}").stdout.splitlines()
  if any(n.startswith(network) for n in remaining+networks):raise RuntimeError("Owned release resources remain; no passing evidence")
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
 print(json.dumps(result))
if __name__=="__main__":main()
