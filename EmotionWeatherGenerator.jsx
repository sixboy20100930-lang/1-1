import React, { useEffect, useRef, useState, useCallback } from "react";

/* ================================================================
   감정 날씨 생성기 — Emotion Weather Generator & Interactive AI Kiosk
   ------------------------------------------------------------------
   관람객이 감정 스펙트럼 버튼을 선택하거나, 채팅창에 자신의 마음/기분을
   자연어로 이야기하면 감정을 분석하여 고품질 파티클 날씨 물리 엔진과
   Web Audio API 기반 사운드가 연동되어 실감나는 날씨 환경이 연출됩니다.
   ================================================================ */

/* ---------- 1. 감정 데이터 & 자연어 키워드 매핑 ---------- */
const MOODS = [
  {
    id: "anxiety",
    label: "불안",
    engine: "typhoon",
    color: "#7A8272",
    accent: "#A8B49C",
    keywords: ["불안", "조마조마", "걱정", "초조", "혼란", "두렵", "무서", "어질어질", "안절부절", "심란", "답답"],
    lines: [
      "거센 휘돌이바람이 마음을 감싸안아요",
      "태풍의 중심 속에서 잠시 거친 숨을 고릅니다",
    ],
    botReply: "마음속에 소용돌이가 치는군요. 태풍의 중심에서 숨을 고르며 마음이 편안해지기를 바라요.",
  },
  {
    id: "sadness",
    label: "슬픔",
    engine: "rain",
    color: "#5C6B83",
    accent: "#8FA3C4",
    keywords: ["슬프", "우울", "눈물", "외롭", "쓸쓸", "아프", "상처", "서럽", "후회", "울적", "속상"],
    lines: ["조용한 빗방울이 마음의 창가에 내려요", "슬픔은 지나가는 비처럼 젖어들다 맑아질 거예요"],
    botReply: "차분한 빗소리가 감싸안아 줄게요. 조용히 비에 마음을 맡겨보세요.",
  },
  {
    id: "calm",
    label: "평온",
    engine: "snow",
    color: "#8CBCCB",
    accent: "#C2E8F3",
    keywords: ["평온", "고요", "편안", "조용", "휴식", "쉬고", "차분", "안정", "따스", "아늑"],
    lines: ["고요한 눈송이가 포근히 내려앉아요", "세상이 멈춘 듯 평화로운 시간이 흘러갑니다"],
    botReply: "포근하고 고요한 눈송이처럼 마음이 한결 편안해지네요.",
  },
  {
    id: "longing",
    label: "그리움",
    engine: "leaves",
    color: "#C4793B",
    accent: "#EAA266",
    keywords: ["그립", "보고싶", "추억", "아련", "옛날", "생각나", "보고파", "미련", "기억"],
    lines: ["바람 따라 흩날리는 낙엽이 추억을 고스란히 담아요", "스쳐 지나가는 계절 속에서 그리움이 내려앉습니다"],
    botReply: "지나간 시간과 추억들이 낙엽처럼 아름답게 흩날리고 있어요.",
  },
  {
    id: "joy",
    label: "기쁨",
    engine: "sparkle",
    color: "#E6B54A",
    accent: "#FFE382",
    keywords: ["기쁘", "행복", "신나", "즐거", "좋아", "감사", "설레", "웃음", "희망", "최고", "축하"],
    lines: ["가슴속 깊은 곳에서 찬란한 삇의 알갱이가 피어나요", "기쁨의 반짝임이 온 세상을 따스하게 채웁니다"],
    botReply: "당신의 기쁨이 환한 빛이 되어 오롯이 번져나가고 있어요!",
  },
  {
    id: "anger",
    label: "분노",
    engine: "storm",
    color: "#B33932",
    accent: "#FF5E54",
    keywords: ["화나", "열받", "짜증", "분노", "억울", "미워", "폭발", "화가", "빡쳐", "성나"],
    lines: ["격렬한 천둥과 번개가 가슴을 두드려요", "거친 폭풍우 속에서 뭉친 응어리를 시원하게 털어내세요"],
    botReply: "가슴속 응어리와 분노를 폭풍우와 번개로 시원하게 방출해 버려요!",
  },
];

const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m]));

/* ---------- 공용 유틸 함수 ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
function hexToRgba(hex, a) {
  const v = hex.replace("#", "");
  const r = parseInt(v.substring(0, 2), 16);
  const g = parseInt(v.substring(2, 4), 16);
  const b = parseInt(v.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- 텍스트 감정 분석 유틸 ---------- */
function analyzeEmotionText(text) {
  const normalized = text.toLowerCase();
  let bestMood = null;
  let maxScore = 0;

  for (const mood of MOODS) {
    let score = 0;
    for (const kw of mood.keywords) {
      if (normalized.includes(kw)) {
        score += 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMood = mood.id;
    }
  }

  // 매칭되는 키워드가 없을 때 기본 감정 추출 (랜덤 또는 조화)
  if (!bestMood) {
    const defaultIds = ["calm", "joy", "sadness", "anxiety"];
    bestMood = defaultIds[Math.floor(Math.random() * defaultIds.length)];
  }

  return bestMood;
}

/* ================================================================
   2. Web Audio API 사운드합성기 (날씨 오디오 엔진)
   ------------------------------------------------------------------
   외부 오디오 파일 없이 Web Audio API의 노이즈 버퍼와 발신기(Oscillator)를
   사용하여 비, 바람, 눈보라, 태풍, 낙엽소리, 별빛 오르골, 천둥 소리를 생생하게 합성합니다.
   ================================================================ */
class WeatherSoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.noiseNode = null;
    this.filterNode = null;
    this.currentMood = null;
    this.oscillators = [];
    this.isMuted = false;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  // 핑크/화이트 노이즈 생성기 (비, 바람, 폭풍 기초 음원)
  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11;
      b6 = white * 0.115926;
    }
    return noiseBuffer;
  }

  stopAll() {
    if (this.noiseNode) {
      try { this.noiseNode.stop(); } catch (_) {}
      this.noiseNode.disconnect();
      this.noiseNode = null;
    }
    if (this.filterNode) {
      this.filterNode.disconnect();
      this.filterNode = null;
    }
    this.oscillators.forEach(o => {
      try { o.stop(); } catch (_) {}
      try { o.disconnect(); } catch (_) {}
    });
    this.oscillators = [];
  }

  playMoodSound(moodId) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    this.stopAll();
    this.currentMood = moodId;
    if (this.isMuted) return;

    const buffer = this.createNoiseBuffer();
    if (!buffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    const now = this.ctx.currentTime;

    switch (moodId) {
      case "rain": // 차분하고 깊은 빗소리
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(900, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.28, now + 1.2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "typhoon": // 휘몰아치는 거센 태풍 소용돌이 바람
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(320, now);
        filter.Q.setValueAtTime(3.5, now);

        // LFO로 바라는 소용돌이 바람 소리 변조
        const lfo = this.ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.3, now);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(240, now);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        this.oscillators.push(lfo);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.45, now + 1.5);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "snow": // 포근하고 안락한 미풍 소리
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "leaves": // 흩날리는 서걱거리는 가을 바람과 소리
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1200, now);
        filter.Q.setValueAtTime(1.8, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 1.2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "sparkle": // 신비로운 반짝임 멜로디 톤
        filter.type = "highpass";
        filter.frequency.setValueAtTime(2500, now);
        gain.gain.setValueAtTime(0.05, now);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;

        // 아름다운 기쁨의 반짝이는 오르골 아르페지오 톤
        const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        freqs.forEach((f, idx) => {
          const osc = this.ctx.createOscillator();
          const oscGain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now + idx * 0.25);
          oscGain.gain.setValueAtTime(0, now);
          oscGain.gain.setValueAtTime(0.08, now + idx * 0.25);
          oscGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.25 + 1.8);
          osc.connect(oscGain);
          oscGain.connect(this.masterGain);
          osc.start(now + idx * 0.25);
          this.oscillators.push(osc);
        });
        break;

      case "storm": // 거친 비와 묵직한 폭풍우
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 1);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      default:
        break;
    }
  }

  // 번개가 칠 때 실시간 천둥 쿠쾅 소리 합성
  playThunderSound() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const buffer = this.createNoiseBuffer();
    if (!buffer) return;

    const thunderNoise = this.ctx.createBufferSource();
    thunderNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + 1.8);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);

    thunderNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    thunderNoise.start(now);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

const audioEngine = new WeatherSoundEngine();

/* ================================================================
   3. 고품질 리얼리스틱 날씨 물리 엔진 (ENGINES)
   ------------------------------------------------------------------
   태풍: 도넛 모양 대신 실제 강력한 암구름 태풍 소용돌이, 대기 나선, 강풍 벡터.
   폭풍: 거대한 뇌운(Cumulonimbus) 볼륨, 3D 깊이 빗줄기, 충격파, 리얼 번개.
   비/눈/낙엽/반짝임: 다층 레이어 대기 효과, 안개 및 입체 파티클.
   ================================================================ */
const ENGINES = {
  /* ---- 비 (슬픔) ---- */
  rain: {
    count: 320,
    create: (w, h) => ({
      x: rand(-w * 0.2, w * 1.2),
      y: rand(-h, h),
      z: rand(0.15, 1),
      len: rand(14, 32),
      speedScale: rand(0.8, 1.3),
    }),
    step: (p, w, h, dt, intensity) => {
      const speed = (380 + intensity * 280) * p.z * p.speedScale * dt;
      p.x += 65 * p.z * dt;
      p.y += speed;
      if (p.y > h) {
        p.y = rand(-40, -10);
        p.x = rand(-w * 0.2, w * 1.1);
        return { splash: true, x: p.x, z: p.z };
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = (0.15 + p.z * 0.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.7, p.z * sizeScale * 1.2);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 8 * p.z, p.y + p.len * p.z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 눈 (평온) ---- */
  snow: {
    count: 240,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(-h, h),
      z: rand(0.15, 1),
      wob: rand(0, Math.PI * 2),
      wobSpeed: rand(0.4, 1.2),
      r: rand(1.2, 3.8),
    }),
    step: (p, w, h, dt, intensity) => {
      p.y += (22 + intensity * 25) * p.z * dt;
      p.wob += dt * p.wobSpeed;
      p.x += Math.sin(p.wob) * (15 * p.z) * dt;
      if (p.y > h + 10) {
        p.y = -10;
        p.x = rand(0, w);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = (0.25 + p.z * 0.6);
      ctx.fillStyle = color;
      ctx.shadowColor = "#FFFFFF";
      ctx.shadowBlur = p.z * 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, p.r * p.z * sizeScale * 0.8), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 실감나는 진짜 태풍 (불안) ----
     기존의 도넛 고리 모양을 완전 개편하여, 대기를 뒤덮는 거대한 태풍의 눈,
     나선형 기류 구름 암운(Spiral Cloud Band) 및 나선 파티클로 구현 */
  typhoon: {
    count: 450,
    create: (w, h) => {
      const angle = rand(0, Math.PI * 2);
      const distRatio = Math.pow(Math.random(), 0.75); // 중심~외곽 고른 분포
      return {
        angle,
        distanceRatio: distRatio,
        z: rand(0.2, 1),
        speed: rand(1.2, 3.0),
        size: rand(2, 6),
        armOffset: Math.floor(rand(0, 4)) * (Math.PI / 2), // 4개의 거대한 나선 팔(Spiral Arms)
      };
    },
    beforeStep: (layer, w, h, dt, intensity) => {
      layer.aux.time = (layer.aux.time || 0) + dt;
      layer.aux.cx = w * 0.5;
      layer.aux.cy = h * 0.45;
      layer.aux.maxR = Math.max(w, h) * 0.75;
      layer.aux.eyeR = 45 + intensity * 35; // 태풍의 눈 고요 영역
    },
    step: (p, w, h, dt, intensity, aux) => {
      // 나선 운동: 자이로 회전 + 각속도
      const currentR = aux.eyeR + p.distanceRatio * (aux.maxR - aux.eyeR);
      const angularVel = (p.speed + (1 - p.distanceRatio) * 2.5 + intensity * 1.5) / (currentR * 0.04);
      p.angle += angularVel * dt;

      // 중심 빨려듦 및 상승 기류
      p.distanceRatio -= 0.04 * dt;
      if (p.distanceRatio < 0) {
        p.distanceRatio = rand(0.8, 1.0);
        p.angle = rand(0, Math.PI * 2);
      }

      // 태풍 파티클 3D 좌표 계산
      const spiralAngle = p.angle + p.armOffset + p.distanceRatio * 3.2;
      p.x = aux.cx + Math.cos(spiralAngle) * currentR * 1.2;
      p.y = aux.cy + Math.sin(spiralAngle) * currentR * 0.75; // 3D 원근 타원
      return null;
    },
    draw: (ctx, p, color, sizeScale, _g, aux) => {
      // 태풍 암운 나선 밴드 및 바람 궤적 그리기
      const tailLen = (12 + (1 - p.distanceRatio) * 28) * p.z;
      const tailAngle = p.angle + 1.45;
      const tx = p.x - Math.cos(tailAngle) * tailLen;
      const ty = p.y - Math.sin(tailAngle) * tailLen * 0.6;

      ctx.globalAlpha = (0.12 + (1 - p.distanceRatio) * 0.55) * p.z;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.8, p.size * p.z * sizeScale * 0.5);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // 태풍 중심부 구름 입자 렌더링
      if (p.z > 0.6) {
        ctx.fillStyle = "#D4DCCE";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.z * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 낙엽 (그리움) ---- */
  leaves: {
    count: 120,
    create: (w, h) => ({
      x: rand(-w * 0.1, w * 1.1),
      y: rand(-h, h),
      z: rand(0.25, 1),
      rot: rand(0, Math.PI * 2),
      spin: rand(-1.8, 1.8),
      wob: rand(0, Math.PI * 2),
      size: rand(5, 11),
      colorType: Math.random() > 0.4 ? "#C4793B" : (Math.random() > 0.5 ? "#D95D39" : "#8F4F24"),
    }),
    step: (p, w, h, dt, intensity) => {
      p.y += (35 + intensity * 25) * p.z * dt;
      p.wob += dt * 1.5;
      p.x += (Math.sin(p.wob) * 35 + 30) * p.z * dt;
      p.rot += p.spin * dt;
      if (p.y > h + 20) {
        p.y = -20;
        p.x = rand(-w * 0.1, w * 1.1);
      }
      return null;
    },
    draw: (ctx, p, _c, sizeScale) => {
      const s = Math.max(3, p.size * p.z * sizeScale * 0.8);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = (0.45 + p.z * 0.5);
      ctx.fillStyle = p.colorType;
      ctx.beginPath();
      // 낙엽 세밀한 잎 형태 렌더링
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.8, -s * 0.2, s * 0.5, s);
      ctx.quadraticCurveTo(0, s * 0.6, -s * 0.5, s);
      ctx.quadraticCurveTo(-s * 0.8, -s * 0.2, 0, -s);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 반짝임 (기쁨) ---- */
  sparkle: {
    count: 180,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(0, h),
      z: rand(0.2, 1),
      phase: rand(0, Math.PI * 2),
      speed: rand(12, 32),
      r: rand(1.5, 4.5),
    }),
    step: (p, w, h, dt, intensity) => {
      p.y -= (p.speed + intensity * 15) * p.z * dt;
      p.phase += dt * 3.5;
      if (p.y < -15) {
        p.y = h + 15;
        p.x = rand(0, w);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.phase));
      ctx.globalAlpha = tw * (0.35 + p.z * 0.65);
      ctx.fillStyle = color;
      ctx.shadowColor = "#FFF3C4";
      ctx.shadowBlur = p.z * 12;

      // 별빛 형태로 반짝이는 입자
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.r * p.z * sizeScale * 0.7), 0, Math.PI * 2);
      ctx.fill();

      if (p.z > 0.7) {
        const starS = p.r * p.z * 1.8;
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - starS, p.y);
        ctx.lineTo(p.x + starS, p.y);
        ctx.moveTo(p.x, p.y - starS);
        ctx.lineTo(p.x, p.y + starS);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 리얼 폭풍우 & 뇌운 번개 (분노) ---- */
  storm: {
    count: 360,
    create: (w, h) => ({
      x: rand(-w * 0.2, w * 1.2),
      y: rand(-h, h),
      z: rand(0.2, 1),
      len: rand(22, 42),
      speed: rand(450, 750),
    }),
    step: (p, w, h, dt, intensity) => {
      p.x += 120 * p.z * dt;
      p.y += (p.speed + intensity * 350) * p.z * dt;
      if (p.y > h) {
        p.y = -30;
        p.x = rand(-w * 0.2, w * 1.1);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = 0.25 + p.z * 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.8, p.z * sizeScale * 1.3);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 14 * p.z, p.y + p.len * p.z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
};

/* ================================================================
   4. 고도화된 3D 번개 헬퍼 함수
   ================================================================ */
function makeBolt(w, h) {
  const startX = rand(w * 0.1, w * 0.9);
  const path = [{ x: startX, y: 0 }];
  const branches = [];
  let x = startX;
  let y = 0;
  const steps = Math.ceil(h / 28);

  for (let i = 0; i < steps && y < h; i++) {
    const progress = y / h;
    x += rand(-55, 55) * (0.5 + progress * 0.9);
    y += rand(22, 42);
    path.push({ x: clamp(x, 10, w - 10), y });

    if (progress > 0.15 && progress < 0.8 && Math.random() < 0.35) {
      branches.push(makeBranch(x, y, w));
    }
  }
  return { path, branches, born: performance.now() };
}

function makeBranch(startX, startY, w) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const path = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;
  const segs = Math.floor(rand(3, 7));
  for (let i = 0; i < segs; i++) {
    x += dir * rand(18, 48);
    y += rand(14, 32);
    path.push({ x: clamp(x, 0, w), y });
  }
  return path;
}

function boltAlpha(elapsedMs) {
  const t = elapsedMs / 320;
  if (t >= 1) return 0;
  if (t < 0.06) return t / 0.06;
  if (t < 0.18) return 1;
  if (t < 0.28) return 0.12;
  if (t < 0.45) return 0.9;
  return 0.9 * (1 - (t - 0.45) / 0.55);
}

/* ================================================================
   5. App 컴포넌트 & 채팅 연동 UI
   ================================================================ */
export default function EmotionWeatherGenerator() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const chatBottomRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [showHero, setShowHero] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // 대화형 채팅 상태
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "안녕하세요! 오늘 당신의 마음과 마음속 날씨는 어떤가요? 편하게 이야기해 주세요.",
    },
  ]);
  const [inputText, setInputText] = useState("");

  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  const scene = useRef({
    curr: null,
    prev: null,
    transitionT: 1,
    lastFrame: 0,
  });

  const buildLayer = useCallback((moodId, w, h) => {
    const mood = MOOD_MAP[moodId];
    const engine = ENGINES[mood.engine];
    const n = reducedMotion.current ? Math.round(engine.count * 0.5) : engine.count;
    return {
      moodId,
      particles: Array.from({ length: n }, () => engine.create(w, h)),
      splashes: [],
      bolts: [],
      aux: {},
      startedAt: performance.now(),
    };
  }, []);

  const selectMood = useCallback(
    (moodId) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setSelected(moodId);
      setShowHero(false);

      // Web Audio API 사운드 재생
      audioEngine.playMoodSound(moodId);

      const s = scene.current;
      if (s.curr && s.curr.moodId !== moodId) {
        s.prev = s.curr;
        s.transitionT = 0;
      } else if (!s.curr) {
        s.transitionT = 1;
      }
      s.curr = buildLayer(moodId, canvas.width, canvas.height);
    },
    [buildLayer]
  );

  // 채팅 메시지 전송 처리
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText("");

    // 유저 메시지 추가
    setMessages((prev) => [...prev, { sender: "user", text: userText }]);

    // 자연어 감정 분석 실행
    const detectedMoodId = analyzeEmotionText(userText);
    const moodObj = MOOD_MAP[detectedMoodId];

    // 날씨 생성 실행
    selectMood(detectedMoodId);

    // 봇 답변 추가
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: moodObj.botReply,
          moodColor: moodObj.color,
          moodLabel: moodObj.label,
        },
      ]);
    }, 400);
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- 캔버스 애니메이션 렌더링 루프 ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const renderLayer = (layer, w, h, alpha, now, dt) => {
      if (!layer) return 0;
      const mood = MOOD_MAP[layer.moodId];
      const engine = ENGINES[mood.engine];
      const dwell = clamp((now - layer.startedAt) / 20000, 0, 1);
      const speedMul = reducedMotion.current ? 0.35 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (engine.beforeStep) {
        engine.beforeStep(layer, w, h, dt * speedMul, dwell);
      }

      // 캔버스 배경 레이어 대기 효과 (안개/공기감)
      if (mood.engine === "typhoon") {
        const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.45, Math.max(w, h) * 0.7);
        bgGrad.addColorStop(0, "rgba(20,25,22,0.45)");
        bgGrad.addColorStop(0.5, "rgba(10,12,11,0.7)");
        bgGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      }

      layer.particles.forEach((p) => {
        const evt = engine.step(p, w, h, dt * speedMul, dwell, layer.aux);
        if (evt?.splash) {
          layer.splashes.push({ x: evt.x, y: h - 4, r: 1, life: 1, z: evt.z });
        }
        engine.draw(ctx, p, mood.color, 2, null, layer.aux);
      });

      // 바닥 튀는 빗방울 파문 효과
      if (mood.engine === "rain" || mood.engine === "storm") {
        for (let i = layer.splashes.length - 1; i >= 0; i--) {
          const sp = layer.splashes[i];
          sp.r += 48 * dt;
          sp.life -= dt * 2.4;
          if (sp.life <= 0) {
            layer.splashes.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = alpha * sp.life * 0.5;
          ctx.strokeStyle = mood.accent;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(sp.x, sp.y, sp.r * sp.z, sp.r * 0.3 * sp.z, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      let maxBoltAlpha = 0;

      // 리얼 뇌운 폭풍우 번개 & 사운드
      if (mood.engine === "storm") {
        if (!reducedMotion.current && Math.random() < 0.012 * (0.6 + dwell)) {
          layer.bolts.push(makeBolt(w, h));
          audioEngine.playThunderSound();
        }

        for (let i = layer.bolts.length - 1; i >= 0; i--) {
          const b = layer.bolts[i];
          const a = boltAlpha(now - b.born);
          if (a <= 0) {
            layer.bolts.splice(i, 1);
            continue;
          }
          maxBoltAlpha = Math.max(maxBoltAlpha, a);

          ctx.globalAlpha = alpha * a;
          ctx.strokeStyle = "#FFFFFF";
          ctx.shadowColor = mood.accent;
          ctx.shadowBlur = 24;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(b.path[0].x, b.path[0].y);
          b.path.forEach((pt) => ctx.lineTo(pt.x, pt.y));
          ctx.stroke();

          ctx.lineWidth = 1.2;
          ctx.globalAlpha = alpha * a * 0.6;
          b.branches.forEach((branch) => {
            ctx.beginPath();
            ctx.moveTo(branch[0].x, branch[0].y);
            branch.forEach((pt) => ctx.lineTo(pt.x, pt.y));
            ctx.stroke();
          });
          ctx.shadowBlur = 0;
        }

        if (maxBoltAlpha > 0) {
          ctx.globalAlpha = alpha * maxBoltAlpha * 0.28;
          ctx.fillStyle = "#F5F0FF";
          ctx.fillRect(0, 0, w, h);
        }
      }

      ctx.restore();
      return maxBoltAlpha;
    };

    const loop = (now) => {
      const w = canvas.width;
      const h = canvas.height;
      const s = scene.current;
      const dt = s.lastFrame ? Math.min(0.05, (now - s.lastFrame) / 1000) : 0.016;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#090A0D";
      ctx.fillRect(0, 0, w, h);

      const activeMood = s.curr ? MOOD_MAP[s.curr.moodId] : null;
      if (activeMood) {
        const g = ctx.createRadialGradient(
          w / 2,
          h * 0.4,
          0,
          w / 2,
          h * 0.5,
          Math.max(w, h) * 0.85
        );
        g.addColorStop(0, hexToRgba(activeMood.color, 0.12));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      if (s.transitionT < 1) {
        s.transitionT = Math.min(1, s.transitionT + 0.025);
        renderLayer(s.prev, w, h, 1 - s.transitionT, now, dt);
        renderLayer(s.curr, w, h, s.transitionT, now, dt);
        if (s.transitionT >= 1) s.prev = null;
      } else {
        renderLayer(s.curr, w, h, 1, now, dt);
      }

      s.lastFrame = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* ---- 전시회 유휴 타이머 ---- */
  useEffect(() => {
    if (!selected || showHero) return;
    const IDLE_MS = 60000;
    const timer = setTimeout(() => setShowHero(true), IDLE_MS);
    return () => clearTimeout(timer);
  }, [selected, showHero]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const handleMuteToggle = () => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);
  };

  const mood = selected ? MOOD_MAP[selected] : null;

  return (
    <div ref={wrapRef} className="ew-root">
      <canvas ref={canvasRef} className="ew-canvas" />

      {/* 시적 캡션 */}
      {mood && !showHero && (
        <div className="ew-caption" aria-live="polite">
          <span className="ew-caption-mood" style={{ color: mood.accent }}>
            {mood.label}
          </span>
          <p className="ew-caption-line">{mood.lines[0]}</p>
          <p className="ew-caption-line ew-caption-line--sub">{mood.lines[1]}</p>
        </div>
      )}

      {/* 상단 툴바 */}
      {!showHero && (
        <div className="ew-toolbar">
          <button className="ew-chip" onClick={() => setShowHero(true)}>
            다시 고르기
          </button>
          <button className="ew-chip ew-chip--icon" onClick={handleMuteToggle} aria-label="사운드 토글">
            {isMuted ? "🔇" : "🔊"}
          </button>
          <button className="ew-chip ew-chip--icon" onClick={toggleFullscreen} aria-label="전체화면 전환">
            ⤢
          </button>
        </div>
      )}

      {/* 초기 히어로 화면 */}
      <div className={`ew-hero ${showHero ? "ew-hero--visible" : ""}`}>
        <p className="ew-hero-eyebrow">REALISTIC EMOTION WEATHER</p>
        <h1 className="ew-hero-title">
          오늘, 마음의 날씨는
          <br />
          어떤가요
        </h1>
        <p className="ew-hero-sub">
          마음속 이야기나 감정을 채팅에 적어보세요. 그 감정이 살아있는 생생한 날씨와 소리로 피어납니다.
        </p>
      </div>

      {/* 대화형 감정 채팅창 오버레이 (우측 상단/하단) */}
      {!showHero && (
        <div className="ew-chat-container">
          <div className="ew-chat-header">
            <span>💬 마음 날씨 대화하기</span>
          </div>
          <div className="ew-chat-messages">
            {messages.map((m, idx) => (
              <div key={idx} className={`ew-chat-bubble ew-chat-bubble--${m.sender}`}>
                {m.moodLabel && (
                  <span className="ew-chat-tag" style={{ backgroundColor: m.moodColor }}>
                    {m.moodLabel}
                  </span>
                )}
                {m.text}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <form className="ew-chat-input-area" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="ew-chat-input"
              placeholder="오늘 마음이나 기분을 적어보세요..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="ew-chat-send">
              전송
            </button>
          </form>
        </div>
      )}

      {/* 감정 스펙트럼 바 */}
      <div className={`ew-spectrum ${showHero ? "ew-spectrum--hero" : "ew-spectrum--dock"}`}>
        <div className="ew-spectrum-line" />
        {MOODS.map((m) => (
          <button
            key={m.id}
            className={`ew-mood ${selected === m.id ? "ew-mood--active" : ""} ${
              showHero ? "ew-mood--pulse" : ""
            }`}
            style={{ "--mood-color": m.color, "--mood-accent": m.accent }}
            onClick={() => selectMood(m.id)}
            aria-pressed={selected === m.id}
          >
            <span className="ew-mood-dot" />
            <span className="ew-mood-label">{m.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Inter:wght@400;500;600&display=swap');

        .ew-root {
          position: relative;
          width: 100%;
          height: 100vh;
          min-height: 560px;
          overflow: hidden;
          background: #090A0D;
          font-family: 'Inter', system-ui, sans-serif;
          color: #F5F1EC;
          touch-action: manipulation;
          -webkit-user-select: none;
          user-select: none;
        }
        .ew-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

        .ew-hero {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 0 24px;
          opacity: 0; pointer-events: none;
          transition: opacity 0.7s ease;
          background: radial-gradient(ellipse at center, rgba(9,10,13,0.2) 0%, rgba(9,10,13,0.85) 75%);
        }
        .ew-hero--visible { opacity: 1; pointer-events: auto; }
        .ew-hero-eyebrow {
          font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: 4px;
          color: #9A968E; margin: 0 0 18px;
        }
        .ew-hero-title {
          font-family: 'Fraunces', serif; font-weight: 300;
          font-size: clamp(32px, 6vw, 56px); line-height: 1.18; margin: 0 0 18px; color: #F5F1EC;
        }
        .ew-hero-sub { font-size: 14px; color: #B9B4AB; margin: 0; max-width: 420px; line-height: 1.6; }

        .ew-caption {
          position: absolute; left: 40px; bottom: 125px; max-width: 360px;
          pointer-events: none; z-index: 2;
        }
        .ew-caption-mood {
          font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: 3px; font-weight: 600;
          display: block; margin-bottom: 8px; text-transform: uppercase;
        }
        .ew-caption-line {
          font-family: 'Fraunces', serif; font-weight: 300; font-size: 22px; line-height: 1.45;
          margin: 0; color: #F5F1EC; text-shadow: 0 2px 8px rgba(0,0,0,0.6);
        }
        .ew-caption-line--sub { color: #A8A298; font-size: 15px; margin-top: 6px; }

        .ew-toolbar { position: absolute; top: 24px; left: 24px; display: flex; gap: 8px; z-index: 10; }
        .ew-chip {
          background: rgba(20,20,26,0.65); border: 1px solid rgba(245,241,236,0.16);
          color: #B9B4AB; font-size: 12px; letter-spacing: 1px;
          padding: 10px 16px; border-radius: 100px; cursor: pointer;
          backdrop-filter: blur(8px); transition: all 0.2s ease;
          min-height: 40px; display: flex; align-items: center; justify-content: center;
        }
        .ew-chip--icon { padding: 10px 14px; font-size: 15px; min-width: 40px; }
        .ew-chip:hover { color: #F5F1EC; border-color: rgba(245,241,236,0.4); background: rgba(30,30,38,0.8); }

        /* 대화형 채팅 UI 스티커 패널 */
        .ew-chat-container {
          position: absolute; top: 24px; right: 24px; width: 320px; max-height: 420px;
          background: rgba(16, 18, 24, 0.75); border: 1px solid rgba(245, 241, 236, 0.15);
          backdrop-filter: blur(12px); border-radius: 16px; display: flex; flex-direction: column;
          z-index: 10; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .ew-chat-header {
          padding: 12px 16px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.08);
          font-size: 13px; font-weight: 500; color: #D8D3CC;
        }
        .ew-chat-messages {
          flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
          max-height: 280px;
        }
        .ew-chat-bubble {
          max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.45;
          word-break: break-word; position: relative;
        }
        .ew-chat-bubble--bot {
          align-self: flex-start; background: rgba(40, 44, 56, 0.85); color: #E6E2DC; border-bottom-left-radius: 2px;
        }
        .ew-chat-bubble--user {
          align-self: flex-end; background: #3B5278; color: #FFFFFF; border-bottom-right-radius: 2px;
        }
        .ew-chat-tag {
          display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px; color: #FFF;
          margin-bottom: 4px; font-weight: 600;
        }
        .ew-chat-input-area {
          display: flex; border-top: 1px solid rgba(255,255,255,0.08); padding: 8px; gap: 6px; background: rgba(0,0,0,0.2);
        }
        .ew-chat-input {
          flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px; padding: 6px 10px; color: #FFF; font-size: 12px; outline: none;
        }
        .ew-chat-input:focus { border-color: rgba(255,255,255,0.3); }
        .ew-chat-send {
          background: #5C6B83; border: none; border-radius: 8px; color: #FFF; font-size: 12px;
          padding: 0 12px; cursor: pointer; font-weight: 500; transition: background 0.2s ease;
        }
        .ew-chat-send:hover { background: #7283A0; }

        .ew-spectrum {
          position: absolute; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 22px; z-index: 10;
          transition: bottom 0.7s cubic-bezier(0.4,0,0.2,1), gap 0.5s ease;
        }
        .ew-spectrum--hero { bottom: 96px; gap: 28px; }
        .ew-spectrum--dock { bottom: 36px; gap: 20px; }
        .ew-spectrum-line {
          position: absolute; left: -16px; right: -16px; top: 5px; height: 1px;
          background: linear-gradient(90deg, #7A8272, #5C6B83, #8CBCCB, #C4793B, #E6B54A, #B33932);
          opacity: 0.45; z-index: 0;
        }

        .ew-mood {
          position: relative; z-index: 1;
          background: transparent; border: none; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 12px 10px; min-width: 44px; min-height: 44px;
          color: #9A968E;
        }
        .ew-mood-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--mood-color); opacity: 0.5;
          box-shadow: 0 0 0 0 transparent;
          transition: all 0.25s ease;
        }
        .ew-mood:hover .ew-mood-dot { opacity: 0.85; transform: scale(1.25); }
        .ew-mood--active .ew-mood-dot {
          opacity: 1; transform: scale(1.4);
          box-shadow: 0 0 18px 3px var(--mood-accent);
        }
        .ew-mood--pulse .ew-mood-dot { animation: ew-pulse 2.6s ease-in-out infinite; }
        .ew-mood--pulse:nth-child(2) .ew-mood-dot { animation-delay: 0.3s; }
        .ew-mood--pulse:nth-child(3) .ew-mood-dot { animation-delay: 0.6s; }
        .ew-mood--pulse:nth-child(4) .ew-mood-dot { animation-delay: 0.9s; }
        .ew-mood--pulse:nth-child(5) .ew-mood-dot { animation-delay: 1.2s; }
        .ew-mood--pulse:nth-child(6) .ew-mood-dot { animation-delay: 1.5s; }
        @keyframes ew-pulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }

        .ew-mood-label {
          font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: 1px;
          transition: color 0.25s ease;
        }
        .ew-mood:hover .ew-mood-label,
        .ew-mood--active .ew-mood-label { color: #F5F1EC; font-weight: 500; }

        @media (max-width: 768px) {
          .ew-chat-container { width: calc(100vw - 48px); right: 24px; top: 76px; max-height: 260px; }
          .ew-spectrum { gap: 10px !important; }
          .ew-mood-label { font-size: 10px; }
          .ew-caption { left: 20px; bottom: 105px; max-width: 82vw; }
          .ew-caption-line { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
