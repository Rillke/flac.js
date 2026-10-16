/**
 * Minimal WAV (RIFF, PCM) writer and parser used by the Node.js and browser
 * tests. Works in both environments (no Node.js specific APIs).
 */

/**
 * Deterministic pseudo random number generator (mulberry32).
 *
 * @param {number} seed
 * @return {function(): number} Returns numbers in [0, 1)
 */
export function prng( seed ) {
	let a = seed >>> 0;
	return function () {
		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/**
 * Creates interleaved integer PCM samples: a sine sweep per channel plus
 * some noise, scaled to the given bit depth.
 *
 * @param {Object} options
 * @param {number} options.frames Number of samples per channel
 * @param {number} [options.channels=2]
 * @param {number} [options.bitsPerSample=16]
 * @param {number} [options.sampleRate=44100]
 * @param {number} [options.seed=1]
 * @return {Int32Array} Interleaved signed samples
 */
export function makeSamples( {
	frames, channels = 2, bitsPerSample = 16, sampleRate = 44100, seed = 1
} ) {
	const rand = prng( seed ),
		max = 2 ** ( bitsPerSample - 1 ) - 1,
		samples = new Int32Array( frames * channels );

	for ( let i = 0; i < frames; i++ ) {
		const t = i / sampleRate;
		for ( let c = 0; c < channels; c++ ) {
			const freq = 220 * ( c + 1 ) + 200 * t,
				value = 0.6 * Math.sin( 2 * Math.PI * freq * t ) + 0.05 * ( rand() * 2 - 1 );
			samples[ i * channels + c ] = Math.max( -max - 1, Math.min( max, Math.round( value * max ) ) );
		}
	}
	return samples;
}

/**
 * Encodes interleaved signed integer samples as little endian PCM bytes.
 * 8 bit samples are stored unsigned (as in WAV files).
 *
 * @param {Int32Array} samples
 * @param {number} bitsPerSample
 * @return {Uint8Array}
 */
export function samplesToPcm( samples, bitsPerSample ) {
	const bytesPerSample = bitsPerSample / 8,
		pcm = new Uint8Array( samples.length * bytesPerSample );

	for ( let i = 0; i < samples.length; i++ ) {
		let v = samples[ i ];
		if ( bitsPerSample === 8 ) {
			v += 128;
		}
		for ( let b = 0; b < bytesPerSample; b++ ) {
			pcm[ i * bytesPerSample + b ] = ( v >> ( 8 * b ) ) & 0xFF;
		}
	}
	return pcm;
}

/**
 * Creates a canonical 44 byte header PCM WAV file.
 *
 * @param {Object} options See makeSamples()
 * @return {Uint8Array}
 */
export function makeWav( options ) {
	const { channels = 2, bitsPerSample = 16, sampleRate = 44100 } = options,
		pcm = samplesToPcm( makeSamples( options ), bitsPerSample ),
		blockAlign = channels * bitsPerSample / 8,
		wav = new Uint8Array( 44 + pcm.length ),
		view = new DataView( wav.buffer ),
		ascii = ( offset, s ) => {
			for ( let i = 0; i < s.length; i++ ) {
				wav[ offset + i ] = s.charCodeAt( i );
			}
		};

	ascii( 0, 'RIFF' );
	view.setUint32( 4, 36 + pcm.length, true );
	ascii( 8, 'WAVE' );
	ascii( 12, 'fmt ' );
	view.setUint32( 16, 16, true );
	view.setUint16( 20, 1, true );
	view.setUint16( 22, channels, true );
	view.setUint32( 24, sampleRate, true );
	view.setUint32( 28, sampleRate * blockAlign, true );
	view.setUint16( 32, blockAlign, true );
	view.setUint16( 34, bitsPerSample, true );
	ascii( 36, 'data' );
	view.setUint32( 40, pcm.length, true );
	wav.set( pcm, 44 );
	return wav;
}

/**
 * Parses a RIFF/WAVE file (PCM or WAVE_FORMAT_EXTENSIBLE).
 *
 * @param {Uint8Array} bytes
 * @return {{channels: number, sampleRate: number, bitsPerSample: number, data: Uint8Array}}
 */
export function parseWav( bytes ) {
	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength ),
		str = ( offset ) => String.fromCharCode( ...bytes.subarray( offset, offset + 4 ) ),
		result = {};

	if ( str( 0 ) !== 'RIFF' || str( 8 ) !== 'WAVE' ) {
		throw new Error( 'Not a RIFF/WAVE file' );
	}
	let offset = 12;
	while ( offset + 8 <= bytes.length ) {
		const id = str( offset ),
			size = view.getUint32( offset + 4, true );
		if ( id === 'fmt ' ) {
			result.format = view.getUint16( offset + 8, true );
			result.channels = view.getUint16( offset + 10, true );
			result.sampleRate = view.getUint32( offset + 12, true );
			result.bitsPerSample = view.getUint16( offset + 22, true );
		} else if ( id === 'data' ) {
			result.data = bytes.subarray( offset + 8, offset + 8 + size );
		}
		offset += 8 + size + ( size % 2 );
	}
	if ( !result.data || !result.channels ) {
		throw new Error( 'Missing fmt or data chunk' );
	}
	return result;
}

/**
 * Converts little endian PCM bytes (as found in WAV files) into
 * floats in [-1, 1).
 *
 * @param {Uint8Array} data
 * @param {number} bitsPerSample
 * @return {Float32Array} Interleaved samples
 */
export function pcmToFloat( data, bitsPerSample ) {
	const bytesPerSample = bitsPerSample / 8,
		out = new Float32Array( data.length / bytesPerSample ),
		scale = 2 ** ( bitsPerSample - 1 );

	for ( let i = 0; i < out.length; i++ ) {
		let v = 0;
		for ( let b = 0; b < bytesPerSample; b++ ) {
			v |= data[ i * bytesPerSample + b ] << ( 8 * b );
		}
		if ( bitsPerSample === 8 ) {
			v -= 128;
		} else {
			// sign extend
			v = ( v << ( 32 - bitsPerSample ) ) >> ( 32 - bitsPerSample );
		}
		out[ i ] = v / scale;
	}
	return out;
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @return {boolean}
 */
export function bytesEqual( a, b ) {
	if ( a.length !== b.length ) {
		return false;
	}
	for ( let i = 0; i < a.length; i++ ) {
		if ( a[ i ] !== b[ i ] ) {
			return false;
		}
	}
	return true;
}
