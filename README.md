# flac.js [![Build Status](https://travis-ci.org/Rillke/flac.js.svg?branch=master)](https://travis-ci.org/Rillke/flac.js)

## JavaScript FLAC (audio format) de- and encoder

[**Project Website**](https://blog.rillke.com/flac.js/) • [Minimal demo](https://rawgit.com/Rillke/flac.js/master/iframe.html)

flac.js encodes or decodes whole files to FLAC, the Free Lossless Audio Codec. Supported input formats are `wav`, `rf64`, `w64`, `aif`, `flac` (flac in its native container as well as in oga/ogg). It is supposed to do the same as the flac executable that can be built from the FLAC sources.

flac.js was built with Emscripten.

## Building
If you just want to use flac.js, you don't have to build it. In this case, see [using](#Using) instead.

### Prerequisites
- A recent linux build system
- Emscripten 1.25.0 installed and activated

### Build script
#### Fully-featured tool
```bash
git clone git://github.com/Rillke/flac.js.git flac.js
cd flac.js
git submodule update --init
./make.sh
```

#### Encoder
```bash
git clone git://github.com/Rillke/flac.js.git flacenc.js
cd flac.js
git checkout encoder
git submodule update --init
./make.sh
```

## Using
A pre-compiled script together with some auxiliary scripts making use from JavaScript easier is in the `/worker` directory.
[iframe.html](iframe.html) is a minimal usage example. [Test it live](https://rawgit.com/Rillke/flac.js/master/iframe.html). It starts the encoding process posting `command: 'encode'` to the worker:
```JavaScript
var worker = new Worker( 'worker/EmsWorkerProxy.js' );
// Files to be read and posted back
// after encoding completed
var outData = {
	// File name
	'encoded.flac': {
		// MIME type
		'MIME': 'audio/flac'
	}
};

worker.onmessage = function( e ) {
	// Handle incoming data
};

// Prepare files etc.

// Post all data and the encode command
// to the web worker
worker.postMessage( {
	command: 'encode',
	args: args,
	outData: outData,
	fileData: storedFiles
} );
```

- `command`: `'encode'|'prefetch'` DOMString that either starts encoding (or decoding) or prefetching the worker script. Posting a prefetch command in advance is optional, depends on the user experience you'd like to create and does not require further arguments. If the script is not prefetched, it will be downloaded when `'encode'` is invoked.
- `args`: Array holding the command line arguments (DOMString)
- `outData`: Object literal of information about the files that should be read out of the worker's file system after encoding completed
- `fileData`: Object literal of input file data mapping file names to `Uint8Array`s

A more extensive example is available on the [project's website](https://blog.rillke.com/flac.js/).

### Bummer! A 3.5 MiB web worker!
Yeah, the data file - `flac.data.js` - is huge but conists mostly of null characters and compresses very well; a compressed size of 30.2 KB when sent `gzip`ed is possible.

## Contributing
Submit patches to this GitHub repository or [file issues](https://github.com/Rillke/flac.js/issues).

## License
See [LICENSE.md](LICENSE.md)
