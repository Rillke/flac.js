#!/usr/bin/env bash

function read_link {
  ( cd $(dirname $1); echo $PWD/$(basename $1) )
}

PREV_DIR="$(pwd)"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FLAC_VARIANT=

cd $DIR
export FLACDIR=$(read_link flac)
export FLACOUTDIR=$(read_link flac/src/flac/.libs/)
export OGGDIR=$(read_link libogg)

function make_ogg {
  cd $OGGDIR
  echo -----------------------------------
  echo Making libogg
  echo -----------------------------------
  ./autogen.sh
  emconfigure ./configure
  emmake make
}

function make_flac {
  cd $FLACDIR
  echo -----------------------------------
  echo Making flac
  echo -----------------------------------

  ./autogen.sh
  emconfigure ./configure --with-ogg=$OGGDIR
  cd $OGGDIR
  ln -s src/.libs lib
  ln -s include/ogg ogg
  cd $FLACDIR
  # fix issue #7: "bad ioctl syscall"
  sed -i.bak '/#define GWINSZ_IN_SYS_IOCTL 1/d' config.h
  emmake make
}

function checkout_flacfull {
  cd $FLACDIR
  git clean -fdx
  git checkout rr/18/flacjs
  FLAC_VARIANT=
}

function checkout_flacenc {
  cd $FLACDIR
  git clean -fdx
  git checkout rr/18/flacencjs
  FLAC_VARIANT=.encoder
}

function make_js {
  cd $FLACOUTDIR
  if [ -d "$FLACOUTDIR" ]; then
    mv flac flac.so
    echo -----------------------------------
    echo Building JavaScript
    echo -----------------------------------
    echo WASM ...
    # ALLOW_MEMORY_GROWTH=1 does not cause performance penalties
    # for WASM build and changing TOTAL_MEMORY at runtime is not
    # supported.
    em++ -O3 "${OGGDIR}/lib/libogg.so" "${FLACDIR}/src/libFLAC/.libs/libFLAC.so" flac.so -o flac.html -s EXPORTED_FUNCTIONS="['_main_js']" -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s RESERVED_FUNCTION_POINTERS=1 -s "BINARYEN_TRAP_MODE='clamp'"
    cp -f flac.js "${DIR}/worker/wasm/flac${FLAC_VARIANT}.js"
    cp -f flac.wasm "${DIR}/worker/wasm/flac${FLAC_VARIANT}.wasm.png"

    echo ASM.JS ...
    em++ -O3 "${OGGDIR}/lib/libogg.so" "${FLACDIR}/src/libFLAC/.libs/libFLAC.so" flac.so -o flac.html -s EXPORTED_FUNCTIONS="['_main_js']" -s RESERVED_FUNCTION_POINTERS=1
    cp -f flac.js "${DIR}/worker/asm/flac${FLAC_VARIANT}.js"
    cp -f flac.html.mem "${DIR}/worker/asm/flac${FLAC_VARIANT}.mem.png"
  else
    echo $FLACOUTDIR is not a directory. Aborting.
  fi
}

function run_js {
  echo -----------------------------------
  echo Running Press Ctrl+C to abort
  echo -----------------------------------
  cd $DIR
  emrun iframe.html
}

function clean {
  cd $OGGDIR && git clean -fdx
  cd $FLACDIR && git clean -fdx
}

make_ogg
checkout_flacfull
make_flac
make_js
checkout_flacenc
make_flac
make_js
checkout_flacfull
run_js

cd $PREV_DIR

