#define _GNU_SOURCE
#include <MagickWand/MagickWand.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <lcms2.h>
#include <seccomp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>

#define MAX_BYTES (5U*1024U*1024U)
/* No filesystem output: even older Landlock ABIs are complemented by denying
 * every write-capable open and pathname mutation. Stdio are anonymous pipes. */
static int sandbox(void) {
  if (geteuid()==0 || syscall(SYS_landlock_create_ruleset,0,0,LANDLOCK_CREATE_RULESET_VERSION)<1) return -1;
  struct landlock_ruleset_attr rules={.handled_access_fs=(1ULL<<13)-1};
  int fd=syscall(SYS_landlock_create_ruleset,&rules,sizeof(rules),0);
  int directory=open("/opt/magick",O_PATH|O_CLOEXEC);
  struct landlock_path_beneath_attr path={.allowed_access=LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_READ_DIR,.parent_fd=directory};
  if(fd<0 || directory<0 || syscall(SYS_landlock_add_rule,fd,LANDLOCK_RULE_PATH_BENEATH,&path,0)<0 || prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)<0 || syscall(SYS_landlock_restrict_self,fd,0)<0) return -1;
  close(directory);close(fd);
  struct rlimit cpu={10,10},memory={512ULL*1024*1024,512ULL*1024*1024},file={0,0},core={0,0};
  if(setrlimit(RLIMIT_CPU,&cpu)||setrlimit(RLIMIT_AS,&memory)||setrlimit(RLIMIT_FSIZE,&file)||setrlimit(RLIMIT_CORE,&core)) return -1;
  scmp_filter_ctx filter=seccomp_init(SCMP_ACT_ERRNO(EPERM));
  if(!filter) return -1;
  const char *allowed[]={"read","write","readv","writev","pread64","close","lseek","fstat","newfstatat","stat","lstat","statx","getdents64","getcwd","readlink","readlinkat","access","faccessat","faccessat2","mmap","mprotect","munmap","mremap","brk","madvise","futex","getpid","gettid","getuid","geteuid","getgid","getegid","getrandom","clock_gettime","clock_getres","gettimeofday","time","times","getrusage","rt_sigaction","rt_sigprocmask","rt_sigreturn","sigaltstack","alarm","setitimer","getitimer","getrlimit","sched_getaffinity","sched_yield","uname","sysinfo","restart_syscall","exit","exit_group"};
  for(size_t i=0;i<sizeof(allowed)/sizeof(*allowed);i++) {
    int call=seccomp_syscall_resolve_name(allowed[i]);
    if(call<0 || seccomp_rule_add(filter,SCMP_ACT_ALLOW,call,0)<0) return -1;
  }
  unsigned int write_flags=O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_APPEND|__O_TMPFILE;
  if(seccomp_rule_add(filter,SCMP_ACT_ALLOW,SCMP_SYS(open),1,SCMP_CMP(1,SCMP_CMP_MASKED_EQ,write_flags,0))<0 ||
     seccomp_rule_add(filter,SCMP_ACT_ALLOW,SCMP_SYS(openat),1,SCMP_CMP(2,SCMP_CMP_MASKED_EQ,write_flags,0))<0 ||
     seccomp_rule_add(filter,SCMP_ACT_ALLOW,SCMP_SYS(prlimit64),2,SCMP_CMP(0,SCMP_CMP_EQ,0),SCMP_CMP(2,SCMP_CMP_EQ,0))<0) return -1;
  int descriptor_commands[]={F_GETFD,F_SETFD,F_GETFL};
  for(size_t i=0;i<sizeof(descriptor_commands)/sizeof(*descriptor_commands);i++) {
    if(seccomp_rule_add(filter,SCMP_ACT_ALLOW,SCMP_SYS(fcntl),1,SCMP_CMP(1,SCMP_CMP_EQ,descriptor_commands[i]))<0) return -1;
  }
  if(seccomp_load(filter)<0) return -1;
  seccomp_release(filter);
  return 0;
}
static int self_test(void) {
  if(open("/etc/passwd",O_RDONLY)>=0 || errno!=EACCES) return 3;
  if(open("forbidden",O_WRONLY|O_CREAT|O_TRUNC,0600)>=0 || errno!=EPERM) return 3;
  if(socket(AF_INET,SOCK_STREAM,0)>=0 || errno!=EPERM) return 3;
  char *args[]={"/bin/true",NULL};char *env[]={NULL};
  if(execve(args[0],args,env)>=0 || errno!=EPERM) return 3;
  if(ftruncate(1,0)>=0 || errno!=EPERM) return 3;
  if(syscall(SYS_kill,getpid(),0)>=0 || errno!=EPERM) return 3;
  if(syscall(SYS_prlimit64,0,RLIMIT_CORE,NULL,NULL)<0) return 3;
  puts("SANDBOX_OK ImageMagick 7.1.2-34 landlock+seccomp stdin-stdout");return 0;
}
int main(int argc,char **argv) {
  if(argc!=2 || sandbox()!=0) return 3;
  if(strcmp(argv[1],"--self-test")==0) return self_test();
  if(strcmp(argv[1],"JPEG") && strcmp(argv[1],"PNG") && strcmp(argv[1],"WEBP")) return 3;
  unsigned char *input=malloc(MAX_BYTES+1);if(!input) return 3;
  size_t length=fread(input,1,MAX_BYTES+1,stdin);
  if(ferror(stdin) || length==0 || length>MAX_BYTES) {free(input);return 2;}
  MagickWandGenesis();
  MagickWand *image=NewMagickWand();
  if(!MagickPingImageBlob(image,input,length) || MagickGetNumberImages(image)!=1 ||
     MagickGetImageWidth(image)<1 || MagickGetImageHeight(image)<1 ||
     MagickGetImageWidth(image)>6000 || MagickGetImageHeight(image)>6000 ||
     MagickGetImageWidth(image)*MagickGetImageHeight(image)>20000000) {
    free(input);DestroyMagickWand(image);MagickWandTerminus();return 2;
  }
  ClearMagickWand(image);
  if(!MagickReadImageBlob(image,input,length) || MagickGetExceptionType(image)>=WarningException) {free(input);DestroyMagickWand(image);MagickWandTerminus();return 2;}
  free(input);
  char *format=MagickGetImageFormat(image);
  size_t width=MagickGetImageWidth(image),height=MagickGetImageHeight(image);
  int valid=format && !strcmp(format,argv[1]) && MagickGetNumberImages(image)==1 && width>0 && height>0 && width<=6000 && height<=6000 && width*height<=20000000;
  if(format) MagickRelinquishMemory(format);
  if(!valid || !MagickAutoOrientImage(image)) goto invalid;
  size_t profile_length=0;
  unsigned char *profile=MagickGetImageProfile(image,"icc",&profile_length);
  if(profile) MagickRelinquishMemory(profile);
  if(profile_length>0) {
    cmsHPROFILE srgb=cmsCreate_sRGBProfile();cmsUInt32Number size=0;
    if(!srgb || !cmsSaveProfileToMem(srgb,NULL,&size)) {if(srgb) cmsCloseProfile(srgb);goto invalid;}
    unsigned char *target=malloc(size);
    if(!target) {cmsCloseProfile(srgb);goto invalid;}
    int converted=cmsSaveProfileToMem(srgb,target,&size) && MagickProfileImage(image,"icc",target,size);
    free(target);cmsCloseProfile(srgb);if(!converted) goto invalid;
  }
  if(!MagickTransformImageColorspace(image,sRGBColorspace) || !MagickStripImage(image)) goto invalid;
  width=MagickGetImageWidth(image);height=MagickGetImageHeight(image);
  if(width>2048 || height>2048) {
    size_t w=width>=height?2048:(width*2048+height/2)/height;
    size_t h=height>=width?2048:(height*2048+width/2)/width;
    if(!MagickResizeImage(image,w?w:1,h?h:1,LanczosFilter)) goto invalid;
  }
  if(!MagickSetImageFormat(image,argv[1])) goto invalid;
  if(strcmp(argv[1],"PNG")==0) {MagickSetOption(image,"png:exclude-chunks","all");MagickSetImageCompression(image,ZipCompression);}
  else if(!MagickSetImageCompressionQuality(image,85)) goto invalid;
  size_t bytes=0;unsigned char *output=MagickGetImageBlob(image,&bytes);
  if(output && bytes>MAX_BYTES) {MagickRelinquishMemory(output);DestroyMagickWand(image);MagickWandTerminus();return 4;}
  if(!output || bytes==0) {if(output) MagickRelinquishMemory(output);goto invalid;}
  int ok=fwrite(output,1,bytes,stdout)==bytes && fflush(stdout)==0;
  MagickRelinquishMemory(output);DestroyMagickWand(image);MagickWandTerminus();return ok?0:3;
invalid:
  DestroyMagickWand(image);MagickWandTerminus();return 2;
}
