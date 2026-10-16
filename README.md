# flac.js [![CI](https://github.com/Rillke/flac.js/actions/workflows/ci.yml/badge.svg)](https://github.com/Rillke/flac.js/actions/workflows/ci.yml)

## JavaScript FLAC (audio format) de- and encoder

[**Project Website**](https://blog.rillke.com/flac.js/) • [Minimal demo](https://raw.githack.com/Rillke/flac.js/master/iframe.html)

flac.js encodes or decodes whole files to FLAC, the Free Lossless Audio Codec. Supported input formats are `wav`, `rf64`, `w64`, `aif`, `flac` (flac in its native container as well as in oga/ogg). It is supposed to do the same as the flac executable that can be built from the FLAC sources.

This version of flac.js was built with Emscripten 6.0.12; flac 1.5.0; libogg 1.3.6

flac.js requires [WebAssembly](https://caniuse.com/wasm) support. The asm.js fallback has been removed.

## Building
If you just want to use flac.js, you don't have to build it. In this case, see [using](#using) instead.

### Prerequisites
- A Linux or macOS build system with CMake and git
- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) installed and activated (use the version mentioned above to get identical build results)

### Build script
```bash
git clone --recursive https://github.com/Rillke/flac.js.git flac.js
cd flac.js
./make.sh
```

The build is reproducible: building with the Emscripten version stated above produces exactly the files committed in `worker/wasm/`. CI verifies this.

`make.sh` builds two variants:
- `worker/wasm/flac.js` (+ `flac.wasm.png`): the complete `flac` tool (encoding, decoding, testing, analyzing). Used by the worker.
- `worker/wasm/flac.encoder.js` (+ `flac.encoder.wasm.png`): encoder only; slightly smaller.

The `.wasm` binaries carry a `.png` suffix so they can be hosted where only certain file extensions are allowed.

### Submodules
The `flac` and `libogg` submodules point to [Rillke/flac](https://github.com/Rillke/flac) and [Rillke/libogg](https://github.com/Rillke/libogg):
- libogg is the unmodified upstream release.
- flac is the upstream release plus one small patch adding a progress callback (`flac__utils_set_progress_callback()`), which flac.js uses to report progress to JavaScript.

## Using
A pre-compiled script together with some auxiliary scripts making use from JavaScript easier is in the `/worker` directory.
[iframe.html](iframe.html) is a minimal usage example. Run `npm start` and open http://127.0.0.1:8080/iframe.html to try it locally. It starts the encoding process posting `command: 'encode'` to the worker:
```JavaScript
var worker = new Worker( 'worker/EmsWorkerProxy.js' );

// Input data
var fileName = 'pcmData.raw';
var inData = {};
// File name -> file content (Uint8Array)
inData[ fileName ] = fileData;

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
	switch ( e.data.reply ) {
		case 'progress':
			// e.data.values: [ samples processed, total samples, bytes written ]
			break;
		case 'log':
		case 'err':
			// e.data.values: Array of strings (output of flac)
			break;
		case 'done':
			// e.data.values[ 'encoded.flac' ].blob is the resulting Blob
			break;
		case 'failed':
			// flac exited with an error; e.data.exitCode
			break;
	}
};

worker.onerror = function( e ) {
	// Handle error
};

// Arguments
var args = [
    "--endian=little", // endianness of samples
    "--sign=unsigned", // representation of numbers
    "--channels=1", // channel count
    "--bps=8", // bits per sample
    "--sample-rate=16000", // sample rate in Hz
    "--force-raw-format", // input is raw PCM
    fileName,
    "-o", "encoded.flac" // output file name
];

// Post all data and the encode command
// to the web worker
worker.postMessage( {
	command: 'encode',
	args: args,
	outData: outData,
	fileData: inData
} );
```

- `command`: `'encode'|'prefetch'|'ping'` DOMString that either starts encoding (or decoding), or prefetching the worker script and WebAssembly binary. Posting a prefetch command in advance is optional, depends on the user experience you'd like to create and does not require further arguments. If the script is not prefetched, it will be downloaded when `'encode'` is invoked. `'ping'` is answered with `{ reply: 'pong' }`.
- `args`: Array holding the [command line arguments](https://xiph.org/flac/documentation_tools_flac.html) (DOMString). Use `-d` to decode.
- `outData`: Object literal of information about the files that should be read out of the worker's file system after encoding completed
- `fileData`: Object literal of input file data mapping file names to `Uint8Array`s

Replies posted by the worker:
- `{ reply: 'progress', values: [ processed, total, extra ] }`: Number of samples processed and the total number of samples. `extra` is the number of bytes written when encoding and the decode position when decoding.
- `{ reply: 'log' | 'err', values: [ text ] }`: Output of flac written to stdout or stderr.
- `{ reply: 'done', values: outData }`: flac completed successfully. Each entry of `outData` got a `blob` property holding the file.
- `{ reply: 'failed', exitCode: number, values: outData }`: flac exited with an error. Output files that were created anyway have a `blob` property.

A worker can process multiple files. Commands are processed one after another.

### Using flac.js in Node.js
The module in `worker/wasm/` can also be used directly, e.g. in Node.js:
```JavaScript
import createFlacModule from 'flac-tool.js/worker/wasm/flac.js';

const flac = await createFlacModule();
flac.FS.writeFile( 'input.wav', wavData );
const exitCode = flac.callMain( [ 'input.wav', '-o', 'output.flac' ] );
const flacData = flac.FS.readFile( 'output.flac' );
```
Create a new module instance for each invocation of `callMain()`.

### Upgrading from flac.js 1.3.2
- The asm.js build (`worker/asm/`) and `worker/EmsArgs.js` have been removed. WebAssembly is required.
- Failures are reported with a `failed` reply.
- A worker no longer needs to be recreated for each file.

A more extensive example is available on the [project's website](https://blog.rillke.com/flac.js/).

## Testing
```bash
npm install
npm test                 # lint and Node.js tests
npx playwright install   # once, to download browsers
npm run test:browser     # tests in Chromium, Firefox and WebKit
```

## Contributing
Submit patches to this GitHub repository or [file issues](https://github.com/Rillke/flac.js/issues).

## License
See [LICENSE.md](LICENSE.md)

