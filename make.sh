#!/bin/bash
export GITDIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"/"
export FLACOUTDIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"/flac/src/flac/.libs/"

cd libogg
echo -----------------------------------
echo Making libogg
echo -----------------------------------
./autogen.sh
emconfigure ./configure
emmake make
export OGGDIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/
cd ..

cd flac
echo -----------------------------------
echo Making flac
echo -----------------------------------

if [ -d "$FLACOUTDIR" ]; then
	emmake make clean
else
	./autogen.sh
	emconfigure ./configure --with-ogg=$OGGDIR
fi
cd ../libogg
ln -s src/.libs lib
ln -s include/ogg ogg
cd ../flac
# fix issue #7: "bad ioctl syscall"
sed -i.bak '/#define GWINSZ_IN_SYS_IOCTL 1/d' config.h
emmake make
export FLACDIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/
cd ..

cd $FLACOUTDIR
if [ -d "$FLACOUTDIR" ]; then
	mv flac flac.so
	echo -----------------------------------
	echo Building JavaScript
	echo -----------------------------------
	em++ -O3 $OGGDIR"lib/libogg.so" $FLACDIR"src/libFLAC/.libs/libFLAC.so" flac.so -o flac.html -s EXPORTED_FUNCTIONS="['_main_js']" -s RESERVED_FUNCTION_POINTERS=1

	cp -f flac.js $GITDIR"worker/flac.js"
	cp -f flac.html.mem $GITDIR"worker/flac.data.js"
	cd $GITDIR
	echo -----------------------------------
	echo Running Press Ctrl+C to abort
	echo -----------------------------------
	emrun iframe.html
else
	echo $FLACOUTDIR is not a directory. Aborting.
fi
