// src/audio.ts

let audioCtx: AudioContext;
let masterGain: GainNode;
let analyzer: AnalyserNode;
let mainFilter: BiquadFilterNode;

const params = {
  att: 0.1,
  dec: 0.2,
  sus: 0.7,
  rel: 0.5,
  cutoff: 2000,
  res: 1,
  lfoFreq: 1,
  lfoAmp: 0.3,
  waveshape: 'sawtooth' as OscillatorType
};

const activeNotes = new Map<number, {
  osc: OscillatorNode,
  gain: GainNode,
  lfo: OscillatorNode,
  lfoGain: GainNode
}>();

export async function initAudio() {
  audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  analyzer = audioCtx.createAnalyser();
  analyzer.fftSize = 2048;

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;

  mainFilter = audioCtx.createBiquadFilter();
  mainFilter.type = 'lowpass';
  mainFilter.frequency.value = params.cutoff;
  mainFilter.Q.value = params.res;

  mainFilter.connect(masterGain);
  masterGain.connect(analyzer);
  analyzer.connect(audioCtx.destination);
  
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  return audioCtx;
}

export function setMasterVolume(value: number) {
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(value, audioCtx.currentTime, 0.05);
  }
}

export function setParam(id: string, value: any) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  switch (id) {
    case 'att': params.att = parseFloat(value); break;
    case 'dec': params.dec = parseFloat(value); break;
    case 'sus': params.sus = parseFloat(value); break;
    case 'rel': params.rel = parseFloat(value); break;
    case 'cutoff': 
      params.cutoff = parseFloat(value); 
      if (mainFilter) mainFilter.frequency.setTargetAtTime(params.cutoff, now, 0.05);
      break;
    case 'res': 
      params.res = parseFloat(value) * 10; // Scale resonance
      if (mainFilter) mainFilter.Q.setTargetAtTime(params.res, now, 0.05);
      break;
    case 'LFOFreq': 
      params.lfoFreq = parseFloat(value); 
      activeNotes.forEach(note => {
        note.lfo.frequency.setTargetAtTime(params.lfoFreq, now, 0.05);
      });
      break;
    case 'amp': 
      params.lfoAmp = parseFloat(value); 
      activeNotes.forEach(note => {
        note.lfoGain.gain.setTargetAtTime(params.lfoAmp * 1000, now, 0.05);
      });
      break;
    case 'waveshape': 
      const shapes: Record<string, string> = {
        '1': 'sine',
        '2': 'sawtooth',
        '3': 'square',
        '4': 'triangle',
        '5': 'square' // Pulse mock
      };
      params.waveshape = (shapes[value] || 'sawtooth') as OscillatorType;
      break;
  }
}

export function noteOn(frequency: number, velocity: number, noteId: number) {
  if (!audioCtx) return;
  if (activeNotes.has(noteId)) return;

  const now = audioCtx.currentTime;
  
  const noteGain = audioCtx.createGain();
  noteGain.gain.setValueAtTime(0, now);
  noteGain.gain.linearRampToValueAtTime(velocity, now + params.att);
  noteGain.gain.linearRampToValueAtTime(velocity * params.sus, now + params.att + params.dec);

  const osc = audioCtx.createOscillator();
  osc.type = params.waveshape;
  osc.frequency.setValueAtTime(frequency, now);

  const lfo = audioCtx.createOscillator();
  lfo.frequency.setValueAtTime(params.lfoFreq, now);
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(params.lfoAmp * 1000, now);
  
  lfo.connect(lfoGain);
  lfoGain.connect(mainFilter.frequency);
  
  osc.connect(noteGain);
  noteGain.connect(mainFilter);
  
  osc.start();
  lfo.start();

  activeNotes.set(noteId, { osc, gain: noteGain, lfo, lfoGain });
}

export function noteOff(noteId: number) {
  if (!audioCtx) return;
  const note = activeNotes.get(noteId);
  if (!note) return;

  const now = audioCtx.currentTime;
  note.gain.gain.cancelScheduledValues(now);
  note.gain.gain.setValueAtTime(note.gain.gain.value, now);
  note.gain.gain.exponentialRampToValueAtTime(0.001, now + params.rel);

  const stopTime = now + params.rel;
  note.osc.stop(stopTime);
  note.lfo.stop(stopTime);

  setTimeout(() => {
    note.osc.disconnect();
    note.gain.disconnect();
    note.lfo.disconnect();
    note.lfoGain.disconnect();
    if (activeNotes.get(noteId) === note) {
        activeNotes.delete(noteId);
    }
  }, params.rel * 1000 + 100);
}

export function getAnalyzer() {
  return analyzer;
}
