/*!
 * Copyright © 2014 Rainer Rillke <lastname>@wikipedia.de
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

/*jslint vars: false,  white: false */
/*jshint onevar: false, white: false, laxbreak: true, worker: true */

( function( global ) {
	'use strict';

	global.tags = {
		'version': {
			'short': 'v',
			'noinputfile': 1
		},
		'help': {
			'short': 'h',
			'noinputfile': 1
		},
		'explain': {
			'short': 'H',
			'noinputfile': 1
		},
		'decode': {
			'short': 'd'
		},
		'test': {
			'short': 't'
		},
		'analyze': {
			'short': 'a'
		},
		'stdout': {
			'short': 'c'
		},
		'silent': {
			'short': 's'
		},
		'totally-silent': {},
		'no-utf8-convert': {},
		'warnings-as-errors': {
			'short': 'w'
		},
		'force': {
			'short': 'f'
		},
		'output-name': {
			'short': 'o',
			'fmt': 'FILENAME',
			'desc': 'Force the output file name'
		},
		'output-prefix': {
			'fmt': 'STRING',
			'desc': 'Prepend STRING to output names'
		},
		'keep-foreign-metadata': {},
		'skip': {
			'fmt': '{#|mm:ss.ss}',
			'desc': 'Skip the given initial samples for each input',
			'constraint': '{#|mm:ss.ss}',
			'regexp': /^(?:\d+|\d+\:[0-5][0-9]([\.\,]\d*))?$/
		},
		'until': {
			'fmt': '{#|[+|-]mm:ss.ss}',
			'desc': 'Stop at the given sample number for each input file.\n'
				+ 'This works for both encoding and decoding, but not testing.\n'
				+ 'The given sample number is not included in the decoded output.\n'
				+ 'The alternative form mm:ss.ss can be used to specify minutes,\n'
				+ 'seconds, and fractions of a second. If a + sign is at the\n'
				+ 'beginning, the --until point is relative to the --skip point.\n'
				+ 'If a - sign is at the beginning, the --until point is relative\n'
				+ 'to end of the audio.',
			'constraint': '{#|[+|-]mm:ss.ss}',
			'regexp': /^(?:\d+|[\+\-]?\d+\:[0-5][0-9]([\.\,]\d*))?$/
		},
		'ogg': {},
		'serial-number': {
			'fmt': '#',
			'desc': 'When used with --ogg, specifies the serial number to use for\n'
				+ 'the first Ogg FLAC stream, which is then incremented for each\n'
				+ 'additional stream. When encoding and no serial number is given,\n'
				+ 'flac uses a random number for the first stream, then increments\n'
				+ 'it for each additional stream. When decoding and no number is\n'
				+ 'given, flac uses the serial number of the first page.',
			'constraint': '#',
			'regexp': /^\d+$/
		},
		'residual-text': {},
		'residual-gnuplot': {},
		'decode-through-errors': {
			'short': 'F'
		},
		'cue': {
			'fmt': '[#.#][-[#.#]]',
			'desc': 'Set the beginning and ending cuepoints to decode',
			'constraint': '[#.#][-[#.#]]',
			'regexp': /^(?:\d+\.\d+(?:\-(?:\d+\.\d+)?)?)?$/
		},
		'verify': {
			'short': 'V'
		},
		'lax': {},
		'ignore-chunk-sizes': {},
		'replay-gain': {},
		'cuesheet': {
			'desc': 'Import cuesheet and store in CUESHEET block\n\n'
				+ 'The cuesheet file must be of the sort written by CDRwin,\n'
				+ 'CDRcue, EAC, etc. See also cuesheet syntax.',
			'fmt': 'file',
			'infile': {
				'accept': 'text/*'
			},
			'regexp': /.*/
		},
		'picture': {
			'desc': "More than one --picture option can be specified.\n" +
					"Either a FILENAME for the picture file or a more\n" +
					"complete SPECIFICATION form can be used. The\n" +
					"SPECIFICATION is a string whose parts are\n" +
					"separated by | (pipe) characters. Some parts may\n" +
					"be left empty to invoke default values. A\n" +
					"FILENAME is just shorthand for \"||||FILENAME\".\n" +
					"The format of SPECIFICATION is\n" +
					"[TYPE]|[MIME-TYPE]|[DESCRIPTION]|[WIDTHxHEIGHT\n" +
					"xDEPTH[/COLORS]]|FILENAME\n" +
					"TYPE is an optional number from one of:\n" +
					"0: Other\n" +
					"1: 32x32 pixel 'file icon' (PNG only)\n" +
					"2: Other file icon\n" +
					"3: Cover (front)\n" +
					"4: Cover (back)\n" +
					"5: Leaflet page\n" +
					"6: Media (e.g., label side of a CD)\n" +
					"7: Lead artist/lead performer/soloist\n" +
					"8: Artist/performer\n" +
					"9: Conductor\n" +
					"10: Band/Orchestra\n" +
					"11: Composer\n" +
					"12: Lyricist/text writer\n" +
					"13: Recording location\n" +
					"14: During recording\n" +
					"15: During performance\n" +
					"16: Movie/video screen capture\n" +
					"17: A bright colored fish\n" +
					"18: Illustration\n" +
					"19: Band/artist logotype\n" +
					"20: Publisher/studio logotype\n" +
					"The default is 3 (front cover). There may only be\n" +
					"one picture each of type 1 and 2 in a file.\n" +
					"MIME-TYPE is optional. If left blank, it will be\n" +
					"detected from the file. For best compatibility\n" +
					"with players, use pictures with a MIME-TYPE of\n" +
					"image/jpeg or image/png. The MIME-TYPE can also\n" +
					"be --> to mean that FILENAME is actually a URL to\n" +
					"an image, though this use is discouraged. The\n" +
					"file at the URL will not be fetched. The URL\n" +
					"itself is stored in the metadata.\n" +
					"DESCRIPTION is optional. The default is an empty\n" +
					"string.\n" +
					"The next part specifies the resolution and color\n" +
					"information. If the MIME-TYPE is image/jpeg,\n" +
					"image/png, or image/gif, you can usually leave\n" +
					"this empty and they can be detected from the\n" +
					"file. Otherwise, you must specify the width in\n" +
					"pixels, height in pixels, and color depth in\n" +
					"bits-per-pixel. If the image has indexed colors\n" +
					"you should also specify the number of colors\n" +
					"used. If possible, these are checked against the\n" +
					"file for accuracy.\n" +
					"FILENAME is the path to the picture file to be\n" +
					"imported, or the URL if the MIME-TYPE is -->.\n",
			'fmt': 'file',
			'infile': {
				'accept': 'image/*,.png,.jpg'
			},
			'regexp': /.*/
		},
		'tag': {
			'fmt': 'FIELD=VALUE',
			'desc': 'Add a FLAC tag; may appear multiple times',
			'regexp': /\=/,
			'short': 'T'
		},
		'tag-from-file': {
			'desc': 'Like --tag but gets value from file',
			'fmt': 'FIELD=FILENAME',
			'infile': {
				'accept': 'text/*'
			},
			'regexp': /\=/
		},
		'seekpoint': {
			'fmt': '{#|X|#x|#s}',
			'desc': 'Add seek point(s)',
			'constraint': '{#|X|#x|#s}',
			'regexp': /^[#Xxs0-9\.\,s]+$/,
			'short': 'S'
		},
		'padding': {
			'fmt': '#',
			'desc': 'Write a PADDING block of length #',
			'constraint': '#',
			'regexp': /^\d+$/,
			'short': 'P'
		},
		'compression-level-0': {
			'short': '0'
		},
		'compression-level-1': {
			'short': '1'
		},
		'compression-level-2': {
			'short': '2'
		},
		'compression-level-3': {
			'short': '3'
		},
		'compression-level-4': {
			'short': '4'
		},
		'compression-level-5': {
			'short': '5'
		},
		'compression-level-6': {
			'short': '6'
		},
		'compression-level-7': {
			'short': '7'
		},
		'compression-level-8': {
			'short': '8'
		},
		'fast': {},
		'best': {},
		'blocksize': {
			'fmt': '#',
			'desc': 'Specify blocksize in samples',
			'constraint': '#',
			'regexp': /^\d+$/,
			'short': 'b'
		},
		'mid-side': {
			'short': 'm'
		},
		'adaptive-mid-side': {
			'short': 'M'
		},
		'exhaustive-model-search': {
			'short': 'e'
		},
		'apodization': {
			'fmt': '"function"',
			'desc': 'Window audio data with given the function',
			'constraint': '"function"',
			'regexp': /\S/,
			'short': 'A'
		},
		'max-lpc-order': {
			'fmt': '#',
			'desc': 'Max LPC order; 0 => only fixed predictors',
			'constraint': '#',
			'regexp': /^(?:[0-9]|[1-2][0-9]|3[0-2])$/,
			'short': 'l'
		},
		'qlp-coeff-precision-search': {
			'short': 'p'
		},
		'qlp-coeff-precision': {
			'fmt': '#',
			'desc': 'Specify precision in bits',
			'constraint': '#',
			'regexp': /^\d+$/,
			'short': 'q'
		},
		'rice-partition-order': {
			'fmt': '[#,]#',
			'desc': 'Set [min,]max residual partition order',
			'constraint': '[#,]#',
			'regexp': /^\d+(?:,\d+)?$/,
			'short': 'r'
		},
		'force-raw-format': {},
		'force-aiff-format': {},
		'force-rf64-format': {},
		'force-wave64-format': {},
		'endian': {
			'fmt': '{big|little}',
			'desc': 'Set byte order for samples',
			'constraint': '{big|little}',
			'regexp': /^(?:big|little)$/
		},
		'channels': {
			'fmt': '#',
			'desc': 'Number of channels',
			'constraint': '#',
			'regexp': /^\d+$/
		},
		'bps': {
			'fmt': '#',
			'desc': 'Number of bits per sample',
			'constraint': '#',
			'regexp': /^\d+$/
		},
		'sample-rate': {
			'fmt': '#',
			'desc': 'Sample rate in Hz',
			'constraint': '#',
			'regexp': /^[0-9\.]+$/
		},
		'sign': {
			'fmt': '{signed|unsigned}',
			'desc': 'Sign of samples',
			'constraint': '{signed|unsigned}',
			'regexp': /^(?:signed|unsigned)$/
		},	
		'input-size': {
			'fmt': '#',
			'desc': 'Size of the raw input in bytes',
			'constraint': '#',
			'regexp': /^(?:signed|unsigned)$/
		},
		'no-adaptive-mid-side': {},
		'no-cued-seekpoints': {},
		'no-decode-through-errors': {},
		'no-error-on-compression-fail': {},
		'no-keep-foreign-metadata': {},
		'no-exhaustive-model-search': {},
		'no-lax': {},
		'no-mid-side': {},
		'no-ogg': {},
		'no-padding': {},
		'no-qlp-coeff-prec-search': {},
		'no-replay-gain': {},
		'no-residual-gnuplot': {},
		'no-residual-text': {},
		'no-ignore-chunk-sizes': {},
		'no-sector-align': {},
		'no-seektable': {},
		'no-silent': {},
		'no-force': {},
		'no-verify': {},
		'no-warnings-as-errors': {}
	};
}( window ) );





















