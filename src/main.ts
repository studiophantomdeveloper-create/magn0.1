import { initAudio, noteOn, noteOff, setParam, getAnalyzer, setMasterVolume } from './audio';

let isPlaying = false;
let audioCtx: AudioContext | null = null;
let analyzer: AnalyserNode | null = null;

const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const statusIndicator = document.getElementById('status-indicator') as HTMLDivElement;
const canvas = document.getElementById('scopeCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const sliders = [
  'att', 'dec', 'sus', 'rel',
  'cutoff', 'res',
  'LFOFreq', 'amp'
];

async function toggleAudio() {
  if (!isPlaying) {
    audioCtx = await initAudio();
    analyzer = getAnalyzer();

    setupEventListeners();
    drawScope();
    syncInitialParams();

    isPlaying = true;
    statusIndicator.classList.add('active');
    startBtn.textContent = 'STOP';
    startBtn.style.background = '#333';
  } else {
    if (audioCtx) {
      if (audioCtx.state === 'running') {
        await audioCtx.suspend();
        isPlaying = false;
        statusIndicator.classList.remove('active');
        startBtn.textContent = 'POWER';
        startBtn.style.background = 'var(--accent-color)';
      } else {
        await audioCtx.resume();
        isPlaying = true;
        statusIndicator.classList.add('active');
        startBtn.textContent = 'STOP';
        startBtn.style.background = '#333';
      }
    }
  }
}

function syncInitialParams() {
  const waveshape = document.getElementById('waveshape') as HTMLSelectElement;
  setParam('waveshape', waveshape.value);

  const masterVol = document.getElementById('masterVol') as HTMLInputElement;
  if (masterVol) {
    setMasterVolume(parseFloat(masterVol.value));
  }

  sliders.forEach(id => {
    const slider = document.getElementById(id) as HTMLInputElement;
    if (slider) {
      setParam(id, slider.value);
    }
  });
}

function setupEventListeners() {
  sliders.forEach(id => {
    const slider = document.getElementById(id) as HTMLInputElement;
    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        const displayObj = document.getElementById(`${id}-val`);
        if (displayObj) displayObj.textContent = val.toFixed(2);
        setParam(id, val);
      });
    }
  });

  const waveshape = document.getElementById('waveshape') as HTMLSelectElement;
  waveshape.addEventListener('change', () => {
    setParam('waveshape', waveshape.value);
  });

  const masterVol = document.getElementById('masterVol') as HTMLInputElement;
  if (masterVol) {
    masterVol.addEventListener('input', () => {
      setMasterVolume(parseFloat(masterVol.value));
    });
  }
}

function setupKeyboard() {
  const keyboardEl = document.getElementById('keyboard')!;
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const numKeys = 25;

  let layoutHTML = '';
  let whiteKeyIndex = 0;
  const whiteKeys: any[] = [];
  const blackKeys: any[] = [];

  for (let i = 0; i < numKeys; i++) {
    const noteName = notes[i % 12];
    const isBlack = noteName.includes('#');
    const freq = 440 * Math.pow(2, (i + 48 - 69) / 12);

    if (isBlack) {
      blackKeys.push({ freq, index: i, leftPercent: (whiteKeyIndex) * (100 / 15) });
    } else {
      whiteKeys.push({ freq, index: i });
      whiteKeyIndex++;
    }
  }

  whiteKeys.forEach(key => {
    layoutHTML += `<div class="key white" data-note="${key.index}" data-freq="${key.freq}"></div>`;
  });
  keyboardEl.innerHTML = layoutHTML;

  blackKeys.forEach(key => {
    const blackKeyEl = document.createElement('div');
    blackKeyEl.className = 'key black';
    blackKeyEl.dataset.note = key.index.toString();
    blackKeyEl.dataset.freq = key.freq.toString();
    blackKeyEl.style.left = `${key.leftPercent}%`;
    keyboardEl.appendChild(blackKeyEl);
  });

  const allKeys = keyboardEl.querySelectorAll('.key');
  allKeys.forEach(key => {
    key.addEventListener('mousedown', () => {
      const el = key as HTMLElement;
      const freq = parseFloat(el.dataset.freq!);
      const id = parseInt(el.dataset.note!);
      el.classList.add('active');
      noteOn(freq, 0.5, id);
    });
    key.addEventListener('mouseup', () => {
      const el = key as HTMLElement;
      const id = parseInt(el.dataset.note!);
      el.classList.remove('active');
      noteOff(id);
    });
    key.addEventListener('mouseleave', () => {
      const el = key as HTMLElement;
      if (el.classList.contains('active')) {
        const id = parseInt(el.dataset.note!);
        el.classList.remove('active');
        noteOff(id);
      }
    });
  });
}

function drawScope() {
  if (!analyzer) return;

  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }

  requestAnimationFrame(drawScope);

  const displayCombo = document.getElementById('displayCombo') as HTMLSelectElement;
  const displayType = parseInt(displayCombo.value) || 1;
  const bufferLength = analyzer.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  if (displayType === 1) {
    // WAVEFORM
    analyzer.getByteTimeDomainData(dataArray);
    ctx.fillStyle = 'rgba(10, 12, 16, 0.2)'; // Fading trail
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#33ff66';
    ctx.beginPath();
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();

  } else if (displayType === 2) {
    // SPECTROSCOPE (Bars)
    analyzer.getByteFrequencyData(dataArray);
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = dataArray[i] / 2;
      ctx.fillStyle = `rgb(${barHeight + 100}, 50, 100)`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }

  } else if (displayType === 3) {
    // SPECTROGRAM (Scrolling Heatmap)
    analyzer.getByteFrequencyData(dataArray);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(imgData, -1, 0); // Scroll left

    for (let i = 0; i < canvas.height; i++) {
      const index = Math.floor(i * bufferLength / canvas.height);
      const value = dataArray[index];
      ctx.fillStyle = `hsl(${260 - value}, 100%, 50%)`;
      ctx.fillRect(canvas.width - 1, canvas.height - i, 1, 1);
    }

  } else if (displayType === 4) {
    // LISSAJOUS (XY Plot)
    analyzer.getByteTimeDomainData(dataArray);
    ctx.fillStyle = 'rgba(10, 12, 16, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ff3366';
    ctx.beginPath();

    for (let i = 0; i < bufferLength - 1; i += 2) {
      const x = (dataArray[i] / 255) * canvas.width;
      const y = (dataArray[i + 1] / 255) * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

startBtn.addEventListener('click', toggleAudio);

// Initial keyboard setup
setupKeyboard();

const homeBtn = document.getElementById('home-btn') as HTMLButtonElement;
if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    window.location.href = 'https://phantomstudio-five.vercel.app/';
  });
}
