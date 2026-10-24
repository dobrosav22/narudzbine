#!/bin/sh
# Deliberately stalled test child for the Java watchdog, not a native sandbox.
if [ "$1" = "--self-test" ]; then
  printf 'SANDBOX_OK ImageMagick 7.1.2-34 landlock+seccomp stdin-stdout\n'
else
  exec /bin/sleep 20
fi
