import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runFlac, encode, decode } from '../helpers/flac-node.mjs';
import { makeWav, makeSamples, samplesToPcm, parseWav, bytesEqual } from '../helpers/wav.mjs';

const ascii = ( bytes, start, end ) => Buffer.from( bytes.subarray( start, end ) ).toString( 'latin1' );

describe( 'flac command line tool', () => {
	it( 'reports its version', async () => {
		const res = await runFlac( [ '--version' ] );
		assert.equal( res.exitCode, 0 );
		assert.match( res.stdout, /^flac 1\.5\.0$/m );
	} );

	it( 'prints help', async () => {
		const res = await runFlac( [ '--help' ] );
		assert.equal( res.exitCode, 0 );
		assert.match( res.stdout, /--decode/ );
	} );

	for ( const format of [
		{ channels: 2, bitsPerSample: 16, sampleRate: 44100 },
		{ channels: 1, bitsPerSample: 16, sampleRate: 16000 },
		{ channels: 1, bitsPerSample: 8, sampleRate: 8000 },
		{ channels: 2, bitsPerSample: 24, sampleRate: 96000 },
		// Plain WAVE files with more than 2 channels have no channel mask
		{ channels: 6, bitsPerSample: 16, sampleRate: 48000, args: [ '--channel-map=none' ] }
	] ) {
		const name = `${ format.channels } ch, ${ format.bitsPerSample } bit, ${ format.sampleRate } Hz`;

		it( `round-trips WAV losslessly (${ name })`, async () => {
			const wav = makeWav( { ...format, frames: format.sampleRate } ),
				flac = await encode( wav, format.args );

			assert.equal( ascii( flac, 0, 4 ), 'fLaC' );

			const decoded = parseWav( await decode( flac, format.args ) ),
				original = parseWav( wav );
			assert.equal( decoded.channels, format.channels );
			assert.equal( decoded.sampleRate, format.sampleRate );
			assert.equal( decoded.bitsPerSample, format.bitsPerSample );
			assert.ok( bytesEqual( decoded.data, original.data ), 'decoded samples must equal the input' );
		} );
	}

	it( 'encodes raw PCM input (README example)', async () => {
		const samples = makeSamples( { frames: 16000, channels: 1, bitsPerSample: 8, sampleRate: 16000 } ),
			pcm = samplesToPcm( samples, 8 ),
			res = await runFlac( [
				'--endian=little', '--sign=unsigned', '--channels=1', '--bps=8', '--sample-rate=16000',
				'--force-raw-format', 'pcmData.raw', '-o', 'encoded.flac'
			], { files: { 'pcmData.raw': pcm }, outputs: [ 'encoded.flac' ] } );

		assert.equal( res.exitCode, 0, res.stderr );
		const raw = await runFlac( [
			'-d', '--force-raw-format', '--endian=little', '--sign=unsigned', 'encoded.flac', '-o', 'decoded.raw'
		], { files: { 'encoded.flac': res.files[ 'encoded.flac' ] }, outputs: [ 'decoded.raw' ] } );
		assert.equal( raw.exitCode, 0, raw.stderr );
		assert.ok( bytesEqual( raw.files[ 'decoded.raw' ], pcm ) );
	} );

	it( 'encodes to and decodes from Ogg FLAC', async () => {
		const wav = makeWav( { frames: 22050 } ),
			res = await runFlac( [ '--ogg', 'in.wav', '-o', 'out.oga' ], {
				files: { 'in.wav': wav }, outputs: [ 'out.oga' ]
			} );

		assert.equal( res.exitCode, 0, res.stderr );
		const oga = res.files[ 'out.oga' ];
		assert.equal( ascii( oga, 0, 4 ), 'OggS' );

		const dec = await runFlac( [ '-d', '--ogg', 'in.oga', '-o', 'out.wav' ], {
			files: { 'in.oga': oga }, outputs: [ 'out.wav' ]
		} );
		assert.equal( dec.exitCode, 0, dec.stderr );
		assert.ok( bytesEqual( parseWav( dec.files[ 'out.wav' ] ).data, parseWav( wav ).data ) );
	} );

	for ( const [ flag, ext ] of [
		[ '--force-aiff-format', 'aiff' ],
		[ '--force-rf64-format', 'rf64' ],
		[ '--force-wave64-format', 'w64' ]
	] ) {
		it( `decodes to and re-encodes from ${ ext.toUpperCase() }`, async () => {
			const wav = makeWav( { frames: 22050, channels: 2, bitsPerSample: 24 } ),
				flac = await encode( wav ),
				other = await decode( flac, [ flag ], `out.${ ext }` ),
				reencoded = await runFlac( [ `in.${ ext }`, '-o', 'again.flac' ], {
					files: { [ `in.${ ext }` ]: other }, outputs: [ 'again.flac' ]
				} );

			assert.equal( reencoded.exitCode, 0, reencoded.stderr );
			const decoded = parseWav( await decode( reencoded.files[ 'again.flac' ] ) );
			assert.ok( bytesEqual( decoded.data, parseWav( wav ).data ) );
		} );
	}

	it( 'compresses better at higher compression levels', async () => {
		const wav = makeWav( { frames: 44100 } ),
			fast = await encode( wav, [ '-0' ] ),
			best = await encode( wav, [ '-8' ] );

		assert.ok( fast.length < wav.length, `-0 (${ fast.length }) should be smaller than WAV (${ wav.length })` );
		assert.ok( best.length < fast.length, `-8 (${ best.length }) should be smaller than -0 (${ fast.length })` );
		assert.ok( bytesEqual( await decode( fast ), await decode( best ) ) );
	} );

	it( 'encodes with verification enabled', async () => {
		const res = await runFlac( [ '--verify', 'in.wav', '-o', 'out.flac' ], {
			files: { 'in.wav': makeWav( { frames: 44100 } ) }, outputs: [ 'out.flac' ]
		} );
		assert.equal( res.exitCode, 0, res.stderr );
		assert.match( res.stderr, /Verify OK/ );
	} );

	it( 'writes Vorbis comments', async () => {
		const flac = await encode( makeWav( { frames: 4410 } ), [ '-T', 'ARTIST=flac.js', '-T', 'TITLE=Ünïcödé' ] ),
			text = Buffer.from( flac ).toString( 'utf8' );

		assert.ok( text.includes( 'ARTIST=flac.js' ) );
		assert.ok( text.includes( 'TITLE=Ünïcödé' ) );
	} );

	it( 'is deterministic', async () => {
		const wav = makeWav( { frames: 44100 } );
		assert.ok( bytesEqual( await encode( wav ), await encode( wav ) ) );
	} );

	it( 'handles input requiring memory growth', async () => {
		// 60 s of 16 bit stereo audio at 48 kHz: ~11 MB input
		const wav = makeWav( { frames: 48000 * 60, sampleRate: 48000 } ),
			flac = await encode( wav );
		assert.ok( bytesEqual( parseWav( await decode( flac ) ).data, parseWav( wav ).data ) );
	} );

	it( 'tests FLAC files', async () => {
		const flac = await encode( makeWav( { frames: 44100 } ) );
		let res = await runFlac( [ '-t', 'in.flac' ], { files: { 'in.flac': flac } } );
		assert.equal( res.exitCode, 0, res.stderr );
		assert.match( res.stderr, /ok/ );

		const corrupted = flac.slice();
		for ( let i = Math.floor( corrupted.length / 2 ); i < corrupted.length / 2 + 64; i++ ) {
			corrupted[ i ] ^= 0x5A;
		}
		res = await runFlac( [ '-t', 'in.flac' ], { files: { 'in.flac': corrupted } } );
		assert.notEqual( res.exitCode, 0 );
	} );

	it( 'fails on invalid input', async () => {
		const res = await runFlac( [ 'in.wav', '-o', 'out.flac' ], {
			files: { 'in.wav': new TextEncoder().encode( 'This is not a WAV file at all.' ) },
			outputs: [ 'out.flac' ]
		} );
		assert.notEqual( res.exitCode, 0 );
		assert.match( res.stderr, /ERROR/ );
	} );

	it( 'fails on missing input files', async () => {
		const res = await runFlac( [ 'missing.wav' ] );
		assert.notEqual( res.exitCode, 0 );
		assert.match( res.stderr, /missing\.wav/ );
	} );

	it( 'rejects invalid options', async () => {
		const res = await runFlac( [ '--no-such-option', 'in.wav' ], {
			files: { 'in.wav': makeWav( { frames: 100 } ) }
		} );
		assert.notEqual( res.exitCode, 0 );
	} );
} );

describe( 'progress callback', () => {
	it( 'reports encoding progress', async () => {
		const frames = 44100 * 5,
			res = await runFlac( [ 'in.wav', '-o', 'out.flac' ], {
				files: { 'in.wav': makeWav( { frames } ) }, outputs: [ 'out.flac' ]
			} );

		assert.equal( res.exitCode, 0 );
		assert.ok( res.progress.length >= 1 );
		for ( const [ processed, total ] of res.progress ) {
			assert.equal( total, frames );
			assert.ok( processed <= total );
		}
		const [ processed, total, bytesWritten ] = res.progress.at( -1 );
		assert.equal( processed, total );
		assert.equal( bytesWritten, res.files[ 'out.flac' ].length );
	} );

	it( 'reports decoding progress', async () => {
		const frames = 44100 * 5,
			flac = await encode( makeWav( { frames } ) ),
			res = await runFlac( [ '-d', 'in.flac', '-o', 'out.wav' ], {
				files: { 'in.flac': flac }, outputs: [ 'out.wav' ]
			} );

		assert.equal( res.exitCode, 0 );
		assert.ok( res.progress.length >= 1 );
		const [ processed, total ] = res.progress.at( -1 );
		assert.equal( processed, frames );
		assert.equal( total, frames );
	} );

	it( 'is invoked even when running silently', async () => {
		const res = await runFlac( [ '--silent', 'in.wav', '-o', 'out.flac' ], {
			files: { 'in.wav': makeWav( { frames: 44100 } ) }, outputs: [ 'out.flac' ]
		} );
		assert.equal( res.exitCode, 0 );
		assert.equal( res.stderr.trim(), '' );
		assert.ok( res.progress.length >= 1 );
	} );
} );

describe( 'encoder-only build', () => {
	it( 'produces the same output as the full build', async () => {
		const wav = makeWav( { frames: 44100 } );
		assert.ok( bytesEqual( await encode( wav, [], 'encoder' ), await encode( wav, [], 'full' ) ) );
	} );

	it( 'rejects decoding', async () => {
		const flac = await encode( makeWav( { frames: 4410 } ) ),
			res = await runFlac( [ '-d', 'in.flac', '-o', 'out.wav' ], {
				files: { 'in.flac': flac }, variant: 'encoder'
			} );
		assert.notEqual( res.exitCode, 0 );
		assert.match( res.stderr, /encoder-only/ );
	} );
} );
