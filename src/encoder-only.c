/*
 * Stub replacing src/flac/decode.c and src/flac/analyze.c for the
 * encoder-only build of flac.js (worker/wasm/flac.encoder.js).
 */
#ifdef HAVE_CONFIG_H
#  include <config.h>
#endif

#include <stdio.h>
#include "FLAC/format.h"
#include "decode.h"
#include "utils.h"

int flac__decode_file(const char *infilename, const char *outfilename, FLAC__bool analysis_mode, analysis_options aopts, decode_options_t options)
{
	(void)outfilename, (void)analysis_mode, (void)aopts, (void)options;
	flac__utils_printf(stderr, 1, "%s: ERROR: decoding and analyzing are not supported by the encoder-only build of flac.js\n", infilename);
	return 1;
}
