#!/bin/sh
set -eu
cd /build
tar -xJf ImageMagick.tar.xz
cd ImageMagick-7.1.2-34
./configure --prefix=/opt/magick --disable-shared --enable-static --disable-openmp --disable-hdri --with-quantum-depth=8 \
 --without-magick-plus-plus --without-modules --without-x --without-perl --without-utilities \
 --without-bzlib --without-djvu --without-dps --without-fftw --without-flif --without-fpx \
 --without-fontconfig --without-freetype --without-gslib --without-gvc --without-heic --without-jbig \
 --without-jxl --without-lqr --without-lzma --without-openexr --without-openjp2 --without-pango \
 --without-raqm --without-raw --without-rsvg --without-tiff --without-uhdr --without-wmf --without-xml --without-zip
make -j4
make install
export PKG_CONFIG_PATH=/opt/magick/lib/pkgconfig
gcc -O2 -Wall -Wextra -Werror -Wl,-z,relro,-z,now -fstack-protector-strong -D_FORTIFY_SOURCE=3 \
 /build/native/processor.c -o /opt/magick/processor $(pkg-config --cflags --libs --static MagickWand) -lseccomp
cp /build/native/policy.xml /opt/magick/etc/ImageMagick-7/policy.xml
mkdir -p /opt/magick/evidence
cp /build/native/*packages.lock /opt/magick/evidence/
cp /build/native/bom.json /opt/magick/evidence/bom.json
printf '%s\n' 'ImageMagick 7.1.2-34' 'source-sha256 55fe0ec246245b46c429f9e6bc65294ad4a78a66b88abd9817971ca157856323' > /opt/magick/evidence/source.txt
dpkg-query -W > /opt/magick/evidence/build-packages.tsv
# Retain native licences, not build headers/static archives/documentation in runtime.
find /opt/magick/lib -name '*.a' -delete
rm -rf /opt/magick/include /opt/magick/lib/pkgconfig /opt/magick/share/man
