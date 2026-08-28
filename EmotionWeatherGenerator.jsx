import React, { useEffect, useRef, useState, useCallback } from "react";

/* ================================================================
   감정 날씨 생성기 — Emotion Weather Generator & Interactive Kiosk
   ------------------------------------------------------------------
   관람객이 화면 하단의 감정 스펙트럼에서 기분을 선택하거나,
   채팅창에 마음이나 기분을 자연어로 이야기하면 감정을 분석하여
   HTML5 Canvas 기반의 고품질 날씨 그래픽 물리 엔진과
   Web Audio API 기반 사운드가 어우러진 대화형 전시를 제공합니다.

   [유지보수 가이드 및 코드 구조]
   1. MOOD_CONFIG      : 감정 데이터, 색상, 키워드, AI 챗봇 멘트 정의
   2. analyzeEmotionText: 자연어 키워드 감정 데이터 분석 유틸
   3. WeatherSoundSynth: Web Audio API 기반 오디오 합성기 (외부 파일 없음)
   4. WEATHER_ENGINES  : 각 날씨별 파티클 & 대기 물리 엔진 모듈 (추가/수정 용이)
   5. LightningUtils   : 번개 줄기 및 섬광 계산 모듈
   6. App Component    : 캔버스 렌더링 루프, Glassmorphism UI, 채팅 시스템
   ================================================================ */

/* ================================================================
   1. 감정 설정 데이터 (MOOD_CONFIG)
   ------------------------------------------------------------------
   새로운 감정이나 날씨를 추가하려면 이 객체 배열에 매핑 데이터만 추가하면 됩니다.
   ================================================================ */
const MOOD_CONFIG = [
  {
    id: "anxiety",
    label: "불안",
    engine: "typhoon",
    color: "#6B7564",
    accent: "#99A68F",
    keywords: ["불안", "조마조마", "걱정", "초조", "혼란", "두렵", "무서", "어질어질", "안절부절", "심란", "답답"],
    lines: [
      "휘돌아 치는 암운 속, 거친 태풍의 눈이 피어납니다",
      "소용돌이 중심에서 거친 숨을 내쉬며 마음을 다스려요",
    ],
    botReply: "마음속에 강력한 소용돌이가 휘감고 있네요. 거친 태풍의 눈 안에서 잠시 평온을 되찾아보세요.",
  },
  {
    id: "sadness",
    label: "슬픔",
    engine: "rain",
    color: "#4F5D75",
    accent: "#8EA1C0",
    keywords: ["슬프", "우울", "눈물", "외롭", "쓸쓸", "아프", "상처", "서럽", "후회", "울적", "속상"],
    lines: [
      "창가에 촉촉한 빗방울이 가만히 적셔옵니다",
      "슬픔은 차분한 비처럼 젖어들다가 이내 스며들 거예요",
    ],
    botReply: "차분히 내리는 빗소리가 지친 마음을 위로해 줄 거예요. 마음껏 비를 마주해도 좋아요.",
  },
  {
    id: "calm",
    label: "평온",
    engine: "snow",
    color: "#7BAEBE",
    accent: "#BBE4F0",
    keywords: ["평온", "고요", "편안", "조용", "휴식", "쉬고", "차분", "안정", "따스", "아늑"],
    lines: [
      "포근한 눈송이가 세상 위에 고요히 내려앉아요",
      "시간이 느리게 흐르듯 마음속에 깊은 안식이 찾아옵니다",
    ],
    botReply: "하얗고 포근한 눈처럼 마음이 잔잔하고 편안해지네요.",
  },
  {
    id: "longing",
    label: "그리움",
    engine: "leaves",
    color: "#B86B2F",
    accent: "#E59B5C",
    keywords: ["그립", "보고싶", "추억", "아련", "옛날", "생각나", "보고파", "미련", "기억"],
    lines: [
      "바람을 타고 흩날리는 낙엽이 추억의 조각을 나릅니다",
      "지나간 계절의 향기가 마음 한켠에 소중히 내립니다",
    ],
    botReply: "소중했던 추억과 기억들이 가을 낙엽처럼 아늑하게 흩날리고 있어요.",
  },
  {
    id: "joy",
    label: "기쁨",
    engine: "sparkle",
    color: "#D9A236",
    accent: "#FFE07D",
    keywords: ["기쁘", "행복", "신나", "즐거", "좋아", "감사", "설레", "웃음", "희망", "최고", "축하"],
    lines: [
      "빛나는 알갱이들이 가슴속 깊은 곳에서 연신 피어나요",
      "기쁨의 벅찬 반짝임이 주변을 찬란하게 밝힙니다",
    ],
    botReply: "당신의 벅찬 기쁨이 눈부신 빛의 축제가 되어 피어나네요!",
  },
  {
    id: "anger",
    label: "분노",
    engine: "storm",
    color: "#A62B2B",
    accent: "#FF665A",
    keywords: ["화나", "열받", "짜증", "분노", "억울", "미워", "폭발", "화가", "빡쳐", "성나"],
    lines: [
      "격렬한 폭풍우와 천둥번개가 묵직한 가슴을 칩니다",
      "거침없이 쏟아지는 번갯불에 응어리진 마음을 시원히 터트리세요",
    ],
    botReply: "마음속 답답한 응어리와 화를 폭풍우와 번개로 시원하게 터뜨려 해소해 보세요!",
  },
];

const MOOD_LOOKUP = Object.fromEntries(MOOD_CONFIG.map((m) => [m.id, m]));

/* ---------- 공용 수학 및 색상 유틸 ---------- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);

function hexToRgba(hex, alpha) {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ================================================================
   2. 자연어 텍스트 감정 분석 유틸
   ================================================================ */
function analyzeEmotionText(input) {
  const text = input.toLowerCase();
  let matchedMood = null;
  let highestScore = 0;

  for (const mood of MOOD_CONFIG) {
    let score = 0;
    for (const kw of mood.keywords) {
      if (text.includes(kw)) score += 1;
    }
    if (score > highestScore) {
      highestScore = score;
      matchedMood = mood.id;
    }
  }

  if (!matchedMood) {
    const defaults = ["calm", "joy", "sadness", "anxiety"];
    matchedMood = defaults[Math.floor(Math.random() * defaults.length)];
  }

  return matchedMood;
}

/* ================================================================
   3. Web Audio API 사운드 합성기 (WeatherSoundSynth)
   ------------------------------------------------------------------
   외부 오디오 리소스 없이 웹 브라우저 자체 오디오 노드로
   실시간 비, 바람, 태풍, 낙엽소리, 오르골, 천둥 소리를 합성합니다.
   ================================================================ */
class WeatherSoundSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.noiseNode = null;
    this.filterNode = null;
    this.oscillators = [];
    this.isMuted = false;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  createNoiseBuffer() {
    if (!this.ctx) return null;
    const size = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < size; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
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
    this.oscillators.forEach((osc) => {
      try { osc.stop(); } catch (_) {}
      try { osc.disconnect(); } catch (_) {}
    });
    this.oscillators = [];
  }

  playMoodAudio(moodId) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    this.stopAll();
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
      case "rain":
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(850, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 1.2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "typhoon":
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(280, now);
        filter.Q.setValueAtTime(4.0, now);

        const lfo = this.ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.25, now);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(320, now);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        this.oscillators.push(lfo);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.42, now + 1.5);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "snow":
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(380, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "leaves":
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1100, now);
        filter.Q.setValueAtTime(2.0, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 1.2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;
        this.filterNode = filter;
        break;

      case "sparkle":
        filter.type = "highpass";
        filter.frequency.setValueAtTime(2400, now);
        gain.gain.setValueAtTime(0.04, now);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
        this.noiseNode = noise;

        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const oscGain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.28);
          oscGain.gain.setValueAtTime(0, now);
          oscGain.gain.setValueAtTime(0.07, now + idx * 0.28);
          oscGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.28 + 1.6);
          osc.connect(oscGain);
          oscGain.connect(this.masterGain);
          osc.start(now + idx * 0.28);
          this.oscillators.push(osc);
        });
        break;

      case "storm":
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1500, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.38, now + 1);
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

  playThunderSound() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const buffer = this.createNoiseBuffer();
    if (!buffer) return;

    const thunder = this.ctx.createBufferSource();
    thunder.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(35, now + 2.0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 2.2);

    thunder.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    thunder.start(now);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.3, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

const audioSynth = new WeatherSoundSynth();

/* ================================================================
   4. 날씨 렌더링 물리 엔진 모듈 (WEATHER_ENGINES)
   ------------------------------------------------------------------
   태풍(typhoon): 거대한 웅장한 암운 소용돌이 나선 구름(Swirling Volumetric Storm Clouds)과
                 태풍의 눈(Eye of the Storm), 기류 나선 파티클 및 3D 타원 원근감 구현.
   ================================================================ */
const WEATHER_ENGINES = {
  /* ---- 1) 리얼리스틱 거대 태풍 (불안) ---- */
  typhoon: {
    count: 380,
    create: (w, h) => {
      const arm = Math.floor(rand(0, 3)); // 3개의 강력한 나선 팔 구름
      const radRatio = Math.pow(Math.random(), 0.65);
      return {
        arm,
        radRatio,
        angle: rand(0, Math.PI * 2),
        speed: rand(1.4, 2.8),
        size: rand(3, 9),
        z: rand(0.3, 1),
        cloudAlpha: rand(0.15, 0.45),
      };
    },
    beforeStep: (layer, w, h, dt, intensity) => {
      layer.aux.time = (layer.aux.time || 0) + dt;
      layer.aux.cx = w * 0.5;
      layer.aux.cy = h * 0.48;
      layer.aux.maxRadius = Math.max(w, h) * 0.8;
      layer.aux.eyeRadius = 55 + intensity * 40; // 태풍의 눈 반지름
    },
    step: (p, w, h, dt, intensity, aux) => {
      const curRadius = aux.eyeRadius + p.radRatio * (aux.maxRadius - aux.eyeRadius);
      // 소용돌이 회전 각속도
      const rotSpeed = (p.speed + (1 - p.radRatio) * 3.5 + intensity * 2.0) / (curRadius * 0.035);
      p.angle += rotSpeed * dt;

      // 중심 수렴 운동
      p.radRatio -= 0.035 * dt;
      if (p.radRatio < 0) {
        p.radRatio = rand(0.85, 1.0);
        p.angle = rand(0, Math.PI * 2);
      }

      // 3D 나선 좌표계 계산
      const spiralOffset = p.arm * ((Math.PI * 2) / 3) + p.radRatio * 2.8;
      const totalAngle = p.angle + spiralOffset;

      p.x = aux.cx + Math.cos(totalAngle) * curRadius * 1.25;
      p.y = aux.cy + Math.sin(totalAngle) * curRadius * 0.68; // 3D 경사 타원 원근감
      return null;
    },
    draw: (ctx, p, color, sizeScale, _g, aux) => {
      // 1. 태풍 암운 나선 대기 구름 덩어리 (Volumetric Cloud Blobs)
      const cloudRadius = p.size * p.z * sizeScale * 2.8;
      const cloudGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cloudRadius);
      cloudGrad.addColorStop(0, hexToRgba(color, p.cloudAlpha * p.z));
      cloudGrad.addColorStop(0.6, hexToRgba("#2A3028", p.cloudAlpha * 0.5 * p.z));
      cloudGrad.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = cloudGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cloudRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. 고속 나선 바람 궤적 벡터
      const streakLen = (14 + (1 - p.radRatio) * 32) * p.z;
      const streakAngle = p.angle + 1.4;
      const x0 = p.x - Math.cos(streakAngle) * streakLen;
      const y0 = p.y - Math.sin(streakAngle) * streakLen * 0.6;

      ctx.globalAlpha = (0.2 + (1 - p.radRatio) * 0.6) * p.z;
      ctx.strokeStyle = "#C2CBBF";
      ctx.lineWidth = Math.max(0.7, p.z * 1.5);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.globalAlpha = 1;
    },
  },

  /* ---- 2) 비 (슬픔) ---- */
  rain: {
    count: 320,
    create: (w, h) => ({
      x: rand(-w * 0.2, w * 1.2),
      y: rand(-h, h),
      z: rand(0.2, 1),
      len: rand(16, 36),
      speedScale: rand(0.85, 1.25),
    }),
    step: (p, w, h, dt, intensity) => {
      const speed = (400 + intensity * 300) * p.z * p.speedScale * dt;
      p.x += 70 * p.z * dt;
      p.y += speed;
      if (p.y > h) {
        p.y = rand(-40, -10);
        p.x = rand(-w * 0.2, w * 1.1);
        return { splash: true, x: p.x, z: p.z };
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = 0.2 + p.z * 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.7, p.z * sizeScale * 1.1);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 8 * p.z, p.y + p.len * p.z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 3) 눈 (평온) ---- */
  snow: {
    count: 260,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(-h, h),
      z: rand(0.2, 1),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(0.5, 1.3),
      r: rand(1.5, 4.2),
    }),
    step: (p, w, h, dt, intensity) => {
      p.y += (24 + intensity * 26) * p.z * dt;
      p.wobble += dt * p.wobbleSpeed;
      p.x += Math.sin(p.wobble) * 16 * p.z * dt;
      if (p.y > h + 10) {
        p.y = -10;
        p.x = rand(0, w);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = 0.3 + p.z * 0.6;
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

  /* ---- 4) 낙엽 (그리움) ---- */
  leaves: {
    count: 130,
    create: (w, h) => ({
      x: rand(-w * 0.1, w * 1.1),
      y: rand(-h, h),
      z: rand(0.3, 1),
      rot: rand(0, Math.PI * 2),
      spin: rand(-2, 2),
      wobble: rand(0, Math.PI * 2),
      size: rand(6, 12),
      leafColor: Math.random() > 0.4 ? "#B86B2F" : (Math.random() > 0.5 ? "#D95338" : "#8A471C"),
    }),
    step: (p, w, h, dt, intensity) => {
      p.y += (38 + intensity * 28) * p.z * dt;
      p.wobble += dt * 1.6;
      p.x += (Math.sin(p.wobble) * 38 + 32) * p.z * dt;
      p.rot += p.spin * dt;
      if (p.y > h + 20) {
        p.y = -20;
        p.x = rand(-w * 0.1, w * 1.1);
      }
      return null;
    },
    draw: (ctx, p, _color, sizeScale) => {
      const s = Math.max(3, p.size * p.z * sizeScale * 0.8);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 0.5 + p.z * 0.45;
      ctx.fillStyle = p.leafColor;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.8, -s * 0.2, s * 0.5, s);
      ctx.quadraticCurveTo(0, s * 0.6, -s * 0.5, s);
      ctx.quadraticCurveTo(-s * 0.8, -s * 0.2, 0, -s);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 5) 반짝임 (기쁨) ---- */
  sparkle: {
    count: 190,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(0, h),
      z: rand(0.2, 1),
      phase: rand(0, Math.PI * 2),
      speed: rand(14, 34),
      r: rand(1.6, 4.8),
    }),
    step: (p, w, h, dt, intensity) => {
      p.y -= (p.speed + intensity * 16) * p.z * dt;
      p.phase += dt * 3.8;
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
      ctx.shadowColor = "#FFF5CC";
      ctx.shadowBlur = p.z * 14;

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.r * p.z * sizeScale * 0.7), 0, Math.PI * 2);
      ctx.fill();

      if (p.z > 0.65) {
        const starLen = p.r * p.z * 2.0;
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - starLen, p.y);
        ctx.lineTo(p.x + starLen, p.y);
        ctx.moveTo(p.x, p.y - starLen);
        ctx.lineTo(p.x, p.y + starLen);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 6) 폭풍우 (분노) ---- */
  storm: {
    count: 380,
    create: (w, h) => ({
      x: rand(-w * 0.2, w * 1.2),
      y: rand(-h, h),
      z: rand(0.2, 1),
      len: rand(24, 46),
      speed: rand(480, 800),
    }),
    step: (p, w, h, dt, intensity) => {
      p.x += 130 * p.z * dt;
      p.y += (p.speed + intensity * 380) * p.z * dt;
      if (p.y > h) {
        p.y = -30;
        p.x = rand(-w * 0.2, w * 1.1);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = 0.3 + p.z * 0.55;
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
   5. 번개 생성 유틸 (LightningUtils)
   ================================================================ */
function generateLightningBolt(w, h) {
  const startX = rand(w * 0.1, w * 0.9);
  const path = [{ x: startX, y: 0 }];
  const branches = [];
  let x = startX;
  let y = 0;
  const steps = Math.ceil(h / 30);

  for (let i = 0; i < steps && y < h; i++) {
    const progress = y / h;
    x += rand(-50, 50) * (0.5 + progress * 0.85);
    y += rand(22, 44);
    path.push({ x: clamp(x, 10, w - 10), y });

    if (progress > 0.15 && progress < 0.75 && Math.random() < 0.32) {
      branches.push(generateLightningBranch(x, y, w));
    }
  }
  return { path, branches, born: performance.now() };
}

function generateLightningBranch(startX, startY, w) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const path = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;
  const segs = Math.floor(rand(3, 6));

  for (let i = 0; i < segs; i++) {
    x += dir * rand(16, 44);
    y += rand(14, 30);
    path.push({ x: clamp(x, 0, w), y });
  }
  return path;
}

function getBoltAlpha(elapsedMs) {
  const t = elapsedMs / 320;
  if (t >= 1) return 0;
  if (t < 0.06) return t / 0.06;
  if (t < 0.18) return 1;
  if (t < 0.28) return 0.14;
  if (t < 0.45) return 0.88;
  return 0.88 * (1 - (t - 0.45) / 0.55);
}

/* ================================================================
   6. 메인 App 컴포넌트
   ================================================================ */
export default function EmotionWeatherGenerator() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const chatBottomRef = useRef(null);

  const [selectedMood, setSelectedMood] = useState(null);
  const [showHero, setShowHero] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // 채팅 메시지 상태
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "안녕하세요! 오늘 당신 마음의 날씨는 어떤가요? 기분이나 이야기를 편하게 말씀해 주세요.",
    },
  ]);
  const [inputText, setInputText] = useState("");

  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  const sceneRef = useRef({
    currLayer: null,
    prevLayer: null,
    transitionT: 1,
    lastFrame: 0,
  });

  // 레이어 생성자
  const createLayer = useCallback((moodId, w, h) => {
    const mood = MOOD_LOOKUP[moodId];
    const engine = WEATHER_ENGINES[mood.engine];
    const particleCount = reducedMotion.current ? Math.round(engine.count * 0.5) : engine.count;

    return {
      moodId,
      particles: Array.from({ length: particleCount }, () => engine.create(w, h)),
      splashes: [],
      bolts: [],
      aux: {},
      startedAt: performance.now(),
    };
  }, []);

  // 감정 선택 이벤트
  const handleSelectMood = useCallback(
    (moodId) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setSelectedMood(moodId);
      setShowHero(false);

      // 사운드 재생
      audioSynth.playMoodAudio(moodId);

      const scene = sceneRef.current;
      if (scene.currLayer && scene.currLayer.moodId !== moodId) {
        scene.prevLayer = scene.currLayer;
        scene.transitionT = 0;
      } else if (!scene.currLayer) {
        scene.transitionT = 1;
      }
      scene.currLayer = createLayer(moodId, canvas.width, canvas.height);
    },
    [createLayer]
  );

  // 자연어 채팅 전송
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = inputText.trim();
    setInputText("");

    setMessages((prev) => [...prev, { sender: "user", text: userMsg }]);

    const detectedMoodId = analyzeEmotionText(userMsg);
    const moodObj = MOOD_LOOKUP[detectedMoodId];

    handleSelectMood(detectedMoodId);

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
    }, 380);
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- 캔버스 애니메이션 루프 ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    const handleResize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    const renderLayer = (layer, w, h, alpha, now, dt) => {
      if (!layer) return 0;
      const mood = MOOD_LOOKUP[layer.moodId];
      const engine = WEATHER_ENGINES[mood.engine];
      const dwell = clamp((now - layer.startedAt) / 20000, 0, 1);
      const speedMul = reducedMotion.current ? 0.35 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (engine.beforeStep) {
        engine.beforeStep(layer, w, h, dt * speedMul, dwell);
      }

      // 태풍 암운 중심 배경 대기 효과
      if (mood.engine === "typhoon") {
        const eyeGrad = ctx.createRadialGradient(
          layer.aux.cx,
          layer.aux.cy,
          layer.aux.eyeRadius * 0.4,
          layer.aux.cx,
          layer.aux.cy,
          layer.aux.maxRadius * 0.75
        );
        eyeGrad.addColorStop(0, "rgba(8,10,9,0.2)");
        eyeGrad.addColorStop(0.4, "rgba(22,26,20,0.6)");
        eyeGrad.addColorStop(1, "rgba(5,7,6,0.85)");

        ctx.fillStyle = eyeGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // 파티클 스텝 & 드로우
      layer.particles.forEach((p) => {
        const evt = engine.step(p, w, h, dt * speedMul, dwell, layer.aux);
        if (evt?.splash) {
          layer.splashes.push({ x: evt.x, y: h - 4, r: 1, life: 1, z: evt.z });
        }
        engine.draw(ctx, p, mood.color, 2, null, layer.aux);
      });

      // 바닥 빗방울 파문
      if (mood.engine === "rain" || mood.engine === "storm") {
        for (let i = layer.splashes.length - 1; i >= 0; i--) {
          const sp = layer.splashes[i];
          sp.r += 50 * dt;
          sp.life -= dt * 2.5;
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

      // 번개 & 천둥
      if (mood.engine === "storm") {
        if (!reducedMotion.current && Math.random() < 0.012 * (0.6 + dwell)) {
          layer.bolts.push(generateLightningBolt(w, h));
          audioSynth.playThunderSound();
        }

        for (let i = layer.bolts.length - 1; i >= 0; i--) {
          const b = layer.bolts[i];
          const a = getBoltAlpha(now - b.born);
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

    const animLoop = (now) => {
      const w = canvas.width;
      const h = canvas.height;
      const scene = sceneRef.current;
      const dt = scene.lastFrame ? Math.min(0.05, (now - scene.lastFrame) / 1000) : 0.016;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#08090C";
      ctx.fillRect(0, 0, w, h);

      const activeMood = scene.currLayer ? MOOD_LOOKUP[scene.currLayer.moodId] : null;
      if (activeMood) {
        const bgAmbient = ctx.createRadialGradient(
          w * 0.5,
          h * 0.42,
          0,
          w * 0.5,
          h * 0.5,
          Math.max(w, h) * 0.85
        );
        bgAmbient.addColorStop(0, hexToRgba(activeMood.color, 0.14));
        bgAmbient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = bgAmbient;
        ctx.fillRect(0, 0, w, h);
      }

      if (scene.transitionT < 1) {
        scene.transitionT = Math.min(1, scene.transitionT + 0.025);
        renderLayer(scene.prevLayer, w, h, 1 - scene.transitionT, now, dt);
        renderLayer(scene.currLayer, w, h, scene.transitionT, now, dt);
        if (scene.transitionT >= 1) scene.prevLayer = null;
      } else {
        renderLayer(scene.currLayer, w, h, 1, now, dt);
      }

      scene.lastFrame = now;
      animationFrameId = requestAnimationFrame(animLoop);
    };

    animationFrameId = requestAnimationFrame(animLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  /* ---- 유휴 화면 초기화 타이머 ---- */
  useEffect(() => {
    if (!selectedMood || showHero) return;
    const IDLE_TIMEOUT = 60000;
    const timer = setTimeout(() => setShowHero(true), IDLE_TIMEOUT);
    return () => clearTimeout(timer);
  }, [selectedMood, showHero]);

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    if (!document.fullscreenElement) {
      wrap?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const handleMuteToggle = () => {
    const muted = audioSynth.toggleMute();
    setIsMuted(muted);
  };

  const mood = selectedMood ? MOOD_LOOKUP[selectedMood] : null;

  return (
    <div ref={wrapRef} className="ew-root">
      <canvas ref={canvasRef} className="ew-canvas" />

      {/* 시적 문구 캡션 */}
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
          <button className="ew-chip ew-chip--icon" onClick={handleMuteToggle} aria-label="사운드">
            {isMuted ? "🔇" : "🔊"}
          </button>
          <button className="ew-chip ew-chip--icon" onClick={toggleFullscreen} aria-label="전체화면">
            ⤢
          </button>
        </div>
      )}

      {/* 히어로 안내 오버레이 */}
      <div className={`ew-hero ${showHero ? "ew-hero--visible" : ""}`}>
        <p className="ew-hero-eyebrow">EMOTION WEATHER KIOSK</p>
        <h1 className="ew-hero-title">
          오늘 당신 마음의 날씨는
          <br />
          어떤가요
        </h1>
        <p className="ew-hero-sub">
          마음속 감정을 자유롭게 채팅에 적어보세요. 그 감정이 살아있는 웅장한 날씨와 소리로 펼쳐집니다.
        </p>
      </div>

      {/* 대화형 채팅 패널 (Glassmorphism UX) */}
      {!showHero && (
        <div className="ew-chat-panel">
          <div className="ew-chat-header">
            <span className="ew-chat-title">💬 마음 날씨 대화하기</span>
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
          <form className="ew-chat-input-row" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="ew-chat-input"
              placeholder="오늘 기분이나 감정을 적어보세요..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="ew-chat-btn">
              전송
            </button>
          </form>
        </div>
      )}

      {/* 하단 감정 스펙트럼 바 */}
      <div className={`ew-spectrum ${showHero ? "ew-spectrum--hero" : "ew-spectrum--dock"}`}>
        <div className="ew-spectrum-line" />
        {MOOD_CONFIG.map((m) => (
          <button
            key={m.id}
            className={`ew-mood ${selectedMood === m.id ? "ew-mood--active" : ""} ${
              showHero ? "ew-mood--pulse" : ""
            }`}
            style={{ "--mood-color": m.color, "--mood-accent": m.accent }}
            onClick={() => handleSelectMood(m.id)}
            aria-pressed={selectedMood === m.id}
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
          background: #08090C;
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
          background: radial-gradient(ellipse at center, rgba(8,9,12,0.2) 0%, rgba(8,9,12,0.85) 75%);
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
        .ew-hero-sub { font-size: 14px; color: #B9B4AB; margin: 0; max-width: 440px; line-height: 1.6; }

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
          background: rgba(20,22,28,0.65); border: 1px solid rgba(245,241,236,0.16);
          color: #B9B4AB; font-size: 12px; letter-spacing: 1px;
          padding: 10px 16px; border-radius: 100px; cursor: pointer;
          backdrop-filter: blur(8px); transition: all 0.2s ease;
          min-height: 40px; display: flex; align-items: center; justify-content: center;
        }
        .ew-chip--icon { padding: 10px 14px; font-size: 15px; min-width: 40px; }
        .ew-chip:hover { color: #F5F1EC; border-color: rgba(245,241,236,0.4); background: rgba(30,34,42,0.8); }

        /* Glassmorphism UX 채팅 패널 */
        .ew-chat-panel {
          position: absolute; top: 24px; right: 24px; width: 330px; max-height: 430px;
          background: rgba(14, 16, 22, 0.75); border: 1px solid rgba(245, 241, 236, 0.15);
          backdrop-filter: blur(14px); border-radius: 16px; display: flex; flex-direction: column;
          z-index: 10; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.45);
        }
        .ew-chat-header {
          padding: 12px 16px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.08);
          font-size: 13px; font-weight: 600; color: #E0DDD7;
        }
        .ew-chat-messages {
          flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 9px;
          max-height: 290px;
        }
        .ew-chat-bubble {
          max-width: 86%; padding: 9px 13px; border-radius: 14px; font-size: 13px; line-height: 1.45;
          word-break: break-word; position: relative;
        }
        .ew-chat-bubble--bot {
          align-self: flex-start; background: rgba(38, 42, 54, 0.85); color: #E8E5DF; border-bottom-left-radius: 3px;
        }
        .ew-chat-bubble--user {
          align-self: flex-end; background: #3B5278; color: #FFFFFF; border-bottom-right-radius: 3px;
        }
        .ew-chat-tag {
          display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 4px; color: #FFF;
          margin-bottom: 5px; font-weight: 600;
        }
        .ew-chat-input-row {
          display: flex; border-top: 1px solid rgba(255,255,255,0.08); padding: 8px; gap: 6px; background: rgba(0,0,0,0.25);
        }
        .ew-chat-input {
          flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px; padding: 7px 11px; color: #FFF; font-size: 12px; outline: none;
        }
        .ew-chat-input:focus { border-color: rgba(255,255,255,0.35); }
        .ew-chat-btn {
          background: #4F5D75; border: none; border-radius: 100px; color: #FFF; font-size: 12px;
          padding: 0 14px; cursor: pointer; font-weight: 500; transition: background 0.2s ease;
        }
        .ew-chat-btn:hover { background: #687997; }

        .ew-spectrum {
          position: absolute; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 22px; z-index: 10;
          transition: bottom 0.7s cubic-bezier(0.4,0,0.2,1), gap 0.5s ease;
        }
        .ew-spectrum--hero { bottom: 96px; gap: 28px; }
        .ew-spectrum--dock { bottom: 36px; gap: 20px; }
        .ew-spectrum-line {
          position: absolute; left: -16px; right: -16px; top: 5px; height: 1px;
          background: linear-gradient(90deg, #6B7564, #4F5D75, #7BAEBE, #B86B2F, #D9A236, #A62B2B);
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
          .ew-chat-panel { width: calc(100vw - 48px); right: 24px; top: 76px; max-height: 260px; }
          .ew-spectrum { gap: 10px !important; }
          .ew-mood-label { font-size: 10px; }
          .ew-caption { left: 20px; bottom: 105px; max-width: 82vw; }
          .ew-caption-line { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
