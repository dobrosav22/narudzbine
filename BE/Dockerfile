# Linux AMD64 manifests resolved from Temurin 25.0.4.1+1 on 2026-10-16.
# Package the already verified JAR; never rebuild between staging and production.
FROM eclipse-temurin@sha256:51ae87bbb1949c1afdff51f6a3e6c5f283d84a4bd68512c9657fdc6605026a49 AS package
WORKDIR /artifact
COPY target/narudzbine-backend-0.1.0-SNAPSHOT.jar application.jar
RUN jar --list --file application.jar > /dev/null

FROM eclipse-temurin@sha256:51ae87bbb1949c1afdff51f6a3e6c5f283d84a4bd68512c9657fdc6605026a49 AS native-build
WORKDIR /build
COPY native/build-packages.lock native/build-packages.lock
RUN printf 'deb https://archive.ubuntu.com/ubuntu noble main universe\ndeb https://archive.ubuntu.com/ubuntu noble-updates main universe\ndeb https://security.ubuntu.com/ubuntu noble-security main universe\n' > /etc/apt/sources.list \
 && rm /etc/apt/sources.list.d/ubuntu.sources \
 && apt-get -o APT::Update::Error-Mode=any -o Acquire::Retries=0 -o Acquire::https::Timeout=30 update \
 && apt-get install -y --no-install-recommends $(cat native/build-packages.lock)
ADD --checksum=sha256:55fe0ec246245b46c429f9e6bc65294ad4a78a66b88abd9817971ca157856323 https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-34/ImageMagick-7.1.2-34.tar.xz ImageMagick.tar.xz
COPY native native
RUN sh native/build.sh

FROM eclipse-temurin@sha256:78498f30dd330b06755c1b134039dcbf8324bedb385136819dd519b842a3816a AS native-runtime
COPY native/runtime-packages.lock /opt/native-runtime-packages.lock
RUN printf 'deb https://archive.ubuntu.com/ubuntu noble main universe\ndeb https://archive.ubuntu.com/ubuntu noble-updates main universe\ndeb https://security.ubuntu.com/ubuntu noble-security main universe\n' > /etc/apt/sources.list \
 && rm /etc/apt/sources.list.d/ubuntu.sources \
 && apt-get -o APT::Update::Error-Mode=any -o Acquire::Retries=0 -o Acquire::https::Timeout=30 update \
 && apt-get install -y --no-install-recommends $(cat /opt/native-runtime-packages.lock) \
 && rm -rf /var/lib/apt/lists/*
COPY --from=native-build /opt/magick /opt/magick
USER 10001:10001
ENV MAGICK_CONFIGURE_PATH=/opt/magick/etc/ImageMagick-7
RUN /opt/magick/processor --self-test

FROM native-runtime AS application
WORKDIR /app
COPY --from=package --chown=10001:10001 /artifact/application.jar /app/application.jar
USER 10001:10001
EXPOSE 10000
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=60", "-jar", "/app/application.jar"]
