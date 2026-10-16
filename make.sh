#!/usr/bin/env bash
#
# Builds flac.js (WebAssembly) from the flac and libogg submodules.
#
# Requirements: Emscripten (emcc/emcmake on PATH), CMake, git.
#
# Usage: ./make.sh [--clean]
#
# Outputs:
#   worker/wasm/flac.js, worker/wasm/flac.wasm.png                  full flac tool
#   worker/wasm/flac.encoder.js, worker/wasm/flac.encoder.wasm.png  encoder only
#
# The .wasm files are stored with a .png suffix so that they can be hosted on
# servers that only accept a fixed set of file extensions.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILDDIR="${BUILDDIR:-$DIR/build}"
OUTDIR="$DIR/worker/wasm"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 2)}"

if [ "${1:-}" = "--clean" ]; then
  rm -rf "$BUILDDIR"
fi

for tool in emcc emcmake cmake; do
  if ! command -v "$tool" > /dev/null; then
    echo "$tool not found. Install and activate Emscripten (https://emscripten.org/) first." >&2
    exit 1
  fi
done

if [ ! -f "$DIR/flac/CMakeLists.txt" ] || [ ! -f "$DIR/libogg/CMakeLists.txt" ]; then
  echo "Submodules missing. Run: git submodule update --init" >&2
  exit 1
fi

mkdir -p "$BUILDDIR" "$OUTDIR"

echo -----------------------------------
echo Making libogg
echo -----------------------------------
emcmake cmake -S "$DIR/libogg" -B "$BUILDDIR/ogg" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$BUILDDIR/prefix" \
  -DBUILD_TESTING=OFF \
  -DINSTALL_DOCS=OFF
cmake --build "$BUILDDIR/ogg" -j "$JOBS"
cmake --install "$BUILDDIR/ogg"

echo -----------------------------------
echo Making flac
echo -----------------------------------
# HAVE_GIT=OFF: Report the release version (instead of the commit hash and
# build date) to keep builds reproducible.
emcmake cmake -S "$DIR/flac" -B "$BUILDDIR/flac" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH="$BUILDDIR/prefix" \
  -DCMAKE_FIND_ROOT_PATH="$BUILDDIR/prefix" \
  -DHAVE_GIT=OFF \
  -DWITH_OGG=ON \
  -DBUILD_CXXLIBS=OFF \
  -DBUILD_PROGRAMS=ON \
  -DBUILD_EXAMPLES=OFF \
  -DBUILD_TESTING=OFF \
  -DBUILD_DOCS=OFF \
  -DINSTALL_MANPAGES=OFF \
  -DWITH_STACK_PROTECTOR=OFF \
  -DWITH_FORTIFY_SOURCE=OFF \
  -DENABLE_MULTITHREADING=OFF
# Builds libFLAC and the object files of the flac command line tool.
# The tool itself is linked below with flac.js specific settings.
cmake --build "$BUILDDIR/flac" -j "$JOBS" --target flacapp

echo -----------------------------------
echo Building JavaScript
echo -----------------------------------
FLACAPPDIR="$BUILDDIR/flac/src/flac/CMakeFiles/flacapp.dir"
LIBS=(
  "$BUILDDIR/flac/src/libFLAC/libFLAC.a"
  "$BUILDDIR/flac/src/share/getopt/libgetopt.a"
  "$BUILDDIR/flac/src/share/grabbag/libgrabbag.a"
  "$BUILDDIR/flac/src/share/replaygain_analysis/libreplaygain_analysis.a"
  "$BUILDDIR/flac/src/share/replaygain_synthesis/libreplaygain_synthesis.a"
  "$BUILDDIR/flac/src/share/utf8/libutf8.a"
  "$BUILDDIR/prefix/lib/libogg.a"
)
COMMON_OBJS=(
  "$FLACAPPDIR/encode.c.o"
  "$FLACAPPDIR/foreign_metadata.c.o"
  "$FLACAPPDIR/local_string_utils.c.o"
  "$FLACAPPDIR/main.c.o"
  "$FLACAPPDIR/utils.c.o"
  "$FLACAPPDIR/vorbiscomment.c.o"
)
LDFLAGS=(
  -O3
  # Factory function: createFlacModule( moduleOverrides ) -> Promise<Module>
  -sMODULARIZE=1
  -sEXPORT_NAME=createFlacModule
  -sENVIRONMENT=web,worker,node
  # main() is invoked through Module.callMain( args )
  -sINVOKE_RUN=0
  -sEXIT_RUNTIME=1
  -sALLOW_MEMORY_GROWTH=1
  # Required by addFunction() for the progress callback
  -sALLOW_TABLE_GROWTH=1
  -sSTACK_SIZE=1MB
  -sFORCE_FILESYSTEM=1
  # WORKERFS: Read Blob/File input lazily instead of copying it into memory
  -lworkerfs.js
  -sEXPORTED_FUNCTIONS=_main,_flac__utils_set_progress_callback
  -sEXPORTED_RUNTIME_METHODS=callMain,FS,WORKERFS,addFunction,removeFunction
)

echo "flac.js (full) ..."
emcc "${COMMON_OBJS[@]}" "$FLACAPPDIR/decode.c.o" "$FLACAPPDIR/analyze.c.o" \
  "${LIBS[@]}" "${LDFLAGS[@]}" -o "$BUILDDIR/flac.js"

echo "flac.encoder.js (encoder only) ..."
emcc -O3 -DHAVE_CONFIG_H \
  -I"$BUILDDIR/flac" -I"$DIR/flac/include" -I"$DIR/flac/src/flac" -I"$BUILDDIR/prefix/include" \
  -c "$DIR/src/encoder-only.c" -o "$BUILDDIR/encoder-only.o"
emcc "${COMMON_OBJS[@]}" "$BUILDDIR/encoder-only.o" \
  "${LIBS[@]}" "${LDFLAGS[@]}" -o "$BUILDDIR/flac.encoder.js"

for variant in flac flac.encoder; do
  sed "s/${variant}\.wasm/${variant}.wasm.png/g" "$BUILDDIR/${variant}.js" > "$OUTDIR/${variant}.js"
  cp -f "$BUILDDIR/${variant}.wasm" "$OUTDIR/${variant}.wasm.png"
done

echo -----------------------------------
echo "Done. Output written to $OUTDIR"
echo -----------------------------------
ls -l "$OUTDIR"
