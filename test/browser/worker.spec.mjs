import { test, expect } from '@playwright/test';

test.beforeEach( async ( { page } ) => {
	await page.goto( '/test/browser/harness.html' );
	await page.waitForFunction( () => window.flacTestReady );
} );

test( 'worker answers ping', async ( { page } ) => {
	const reply = await page.evaluate( () => new Promise( ( resolve ) => {
		const worker = window.flacTest.newWorker();
		worker.onmessage = ( e ) => resolve( e.data );
		worker.postMessage( { command: 'ping' } );
	} ) );
	expect( reply ).toEqual( { reply: 'pong' } );
} );

test( 'encodes WAV to FLAC and decodes it back losslessly', async ( { page } ) => {
	const result = await page.evaluate( async () => {
		const { wav, runCommand, newWorker, blobToBytes } = window.flacTest,
			input = wav.makeWav( { frames: 44100 * 3, channels: 2, sampleRate: 44100 } ),
			worker = newWorker(),
			encReplies = await runCommand( worker, {
				command: 'encode',
				args: [ 'input.wav', '-o', 'output.flac' ],
				fileData: { 'input.wav': input },
				outData: { 'output.flac': { MIME: 'audio/flac' } }
			} ),
			encDone = encReplies.at( -1 ),
			flacBlob = encDone.values[ 'output.flac' ].blob,
			flac = await blobToBytes( flacBlob ),
			decReplies = await runCommand( worker, {
				command: 'encode',
				args: [ '-d', 'input.flac', '-o', 'output.wav' ],
				fileData: { 'input.flac': flac },
				outData: { 'output.wav': { MIME: 'audio/wav' } }
			} ),
			decoded = await blobToBytes( decReplies.at( -1 ).values[ 'output.wav' ].blob );

		worker.terminate();
		return {
			encReply: encDone.reply,
			mime: flacBlob.type,
			magic: String.fromCharCode( ...flac.subarray( 0, 4 ) ),
			flacSize: flac.length,
			inputSize: input.length,
			progress: encReplies.filter( ( r ) => r.reply === 'progress' ).map( ( r ) => r.values ),
			logs: encReplies.filter( ( r ) => r.reply === 'log' || r.reply === 'err' ).map( ( r ) => r.values.join( ' ' ) ),
			decReply: decReplies.at( -1 ).reply,
			lossless: wav.bytesEqual( wav.parseWav( decoded ).data, wav.parseWav( input ).data )
		};
	} );

	expect( result.encReply ).toBe( 'done' );
	expect( result.mime ).toBe( 'audio/flac' );
	expect( result.magic ).toBe( 'fLaC' );
	expect( result.flacSize ).toBeLessThan( result.inputSize );
	expect( result.progress.length ).toBeGreaterThan( 0 );
	const [ processed, total, bytesWritten ] = result.progress.at( -1 );
	expect( processed ).toBe( 44100 * 3 );
	expect( total ).toBe( 44100 * 3 );
	expect( bytesWritten ).toBe( result.flacSize );
	expect( result.logs.join( '\n' ) ).toContain( 'flac 1.5.0' );
	expect( result.decReply ).toBe( 'done' );
	expect( result.lossless ).toBe( true );
} );

test( 'output can be decoded by the browser\'s own FLAC decoder', async ( { page, browserName } ) => {
	const result = await page.evaluate( async () => {
		const { wav, runCommand, newWorker, blobToBytes } = window.flacTest,
			sampleRate = 48000,
			input = wav.makeWav( { frames: sampleRate, channels: 2, sampleRate } ),
			worker = newWorker(),
			replies = await runCommand( worker, {
				command: 'encode',
				args: [ 'input.wav', '-o', 'output.flac' ],
				fileData: { 'input.wav': input },
				outData: { 'output.flac': { MIME: 'audio/flac' } }
			} ),
			flac = await blobToBytes( replies.at( -1 ).values[ 'output.flac' ].blob );
		worker.terminate();

		let audioBuffer;
		try {
			const ctx = new OfflineAudioContext( 2, sampleRate, sampleRate );
			audioBuffer = await ctx.decodeAudioData( flac.buffer );
		} catch ( e ) {
			return { unsupported: String( e && e.message || e ) };
		}

		const expected = wav.pcmToFloat( wav.parseWav( input ).data, 16 );
		let maxDiff = 0;
		for ( let c = 0; c < 2; c++ ) {
			const channel = audioBuffer.getChannelData( c );
			for ( let i = 0; i < channel.length; i++ ) {
				maxDiff = Math.max( maxDiff, Math.abs( channel[ i ] - expected[ i * 2 + c ] ) );
			}
		}
		return {
			channels: audioBuffer.numberOfChannels,
			length: audioBuffer.length,
			maxDiff
		};
	} );

	test.skip( !!result.unsupported, `${ browserName } cannot decode FLAC: ${ result.unsupported }` );
	expect( result.channels ).toBe( 2 );
	expect( result.length ).toBe( 48000 );
	// Browsers may scale integer samples slightly differently
	expect( result.maxDiff ).toBeLessThanOrEqual( 2 / 32768 );
} );

test( 'reports failures', async ( { page } ) => {
	const replies = await page.evaluate( async () => {
		const { runCommand, newWorker } = window.flacTest,
			worker = newWorker(),
			res = await runCommand( worker, {
				command: 'encode',
				args: [ 'input.wav', '-o', 'output.flac' ],
				fileData: { 'input.wav': new TextEncoder().encode( 'not a wave file' ) },
				outData: { 'output.flac': { MIME: 'audio/flac' } }
			} );
		worker.terminate();
		return res.map( ( r ) => ( { reply: r.reply, exitCode: r.exitCode, text: r.reply === 'err' ? r.values.join( ' ' ) : '' } ) );
	} );

	const last = replies.at( -1 );
	expect( last.reply ).toBe( 'failed' );
	expect( last.exitCode ).not.toBe( 0 );
	expect( replies.filter( ( r ) => r.reply === 'err' ).map( ( r ) => r.text ).join( '\n' ) ).toContain( 'ERROR' );
} );

test( 'processes multiple files with one worker after prefetching', async ( { page } ) => {
	const results = await page.evaluate( async () => {
		const { wav, runCommand, newWorker, blobToBytes } = window.flacTest,
			worker = newWorker();

		worker.postMessage( { command: 'prefetch' } );

		const out = [];
		for ( const channels of [ 1, 2, 1 ] ) {
			const replies = await runCommand( worker, {
				command: 'encode',
				args: [ '-8', 'in.wav', '-o', 'out.flac' ],
				fileData: { 'in.wav': wav.makeWav( { frames: 8000, channels, sampleRate: 8000, seed: channels } ) },
				outData: { 'out.flac': { MIME: 'audio/flac' } }
			} );
			const last = replies.at( -1 );
			out.push( {
				reply: last.reply,
				size: last.reply === 'done' ? ( await blobToBytes( last.values[ 'out.flac' ].blob ) ).length : 0
			} );
		}
		worker.terminate();
		return out;
	} );

	expect( results.map( ( r ) => r.reply ) ).toEqual( [ 'done', 'done', 'done' ] );
	// Same input yields the same output
	expect( results[ 0 ].size ).toBe( results[ 2 ].size );
	expect( results[ 1 ].size ).toBeGreaterThan( results[ 0 ].size );
} );

test( 'queues commands posted at once', async ( { page } ) => {
	const replies = await page.evaluate( () => new Promise( ( resolve ) => {
		const { wav, newWorker } = window.flacTest,
			worker = newWorker(),
			done = [];

		worker.onmessage = ( e ) => {
			if ( e.data.reply === 'done' || e.data.reply === 'failed' ) {
				done.push( Object.keys( e.data.values || {} ) );
				if ( done.length === 3 ) {
					worker.terminate();
					resolve( done );
				}
			}
		};
		for ( const name of [ 'a', 'b', 'c' ] ) {
			worker.postMessage( {
				command: 'encode',
				args: [ `${ name }.wav` ],
				fileData: { [ `${ name }.wav` ]: wav.makeWav( { frames: 4000 } ) },
				outData: { [ `${ name }.flac` ]: { MIME: 'audio/flac' } }
			} );
		}
	} ) );

	expect( replies ).toEqual( [ [ 'a.flac' ], [ 'b.flac' ], [ 'c.flac' ] ] );
} );
