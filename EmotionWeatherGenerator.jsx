import React, { useEffect, useRef, useState, useCallback } from "react";

/* ================================================================
   감정 날씨 생성기 — Emotion Weather Generator (전시회 키오스크 버전)
   ------------------------------------------------------------------
   관람객이 화면 하단의 감정 스펙트럼에서 오늘의 기분을 고르면,
   그 감정에 대응하는 날씨가 캔버스 위에 피어난다.

   파일 구성 (위에서 아래 순서):
   1. MOODS         - 감정 데이터 (라벨/색/시적 문장/사용할 엔진 이름)
   2. ENGINES       - 날씨별 물리 엔진. 날씨를 하나 추가하고 싶으면 이 객체에만
                       새 항목을 추가하면 되고, 나머지 코드는 손댈 필요가 없다.
   3. 번개 헬퍼 함수  - 폭풍 전용, 현실적인 번개 줄기/곁가지/깜빡임 생성
   4. App 컴포넌트   - 캔버스 애니메이션 루프 + 감정 선택 UI + 전시회용 기능
                       (일정 시간 조작이 없으면 자동으로 처음 화면으로 복귀,
                        터치 친화적 버튼, 전체화면 전환)
   ================================================================ */

/* ---------- 1. 감정 데이터 ----------
   각 감정은 라벨(한글 이름), 사용할 날씨 엔진 이름(engine),
   그 감정의 색(color), 화면에 표시될 시적인 두 줄(lines)을 갖는다.
   스펙트럼 바에 표시되는 순서 = 아래 배열 순서(차분한 색 → 강렬한 색). */
const MOODS = [
  {
    id: "anxiety", // 감정 고유 id (state 값으로 쓰임)
    label: "불안", // 화면에 보이는 한글 라벨
    engine: "typhoon", // 이 감정이 사용할 날씨 엔진 이름 (ENGINES의 key와 일치해야 함)
    color: "#8A9180", // 이 감정을 상징하는 색 (흐린 카키그린 — 불안정하고 탁한 느낌)
    lines: [
      "소용돌이가 마음을 휘감아요",
      "무엇에도 중심을 잡기 어려운 하루예요",
    ],
  },
  {
    id: "sadness",
    label: "슬픔",
    engine: "rain",
    color: "#6C7A96",
    lines: ["빗방울이 창가에 맺혀요", "마음 한 켠이 조용히 젖어들어요"],
  },
  {
    id: "calm",
    label: "평온",
    engine: "snow",
    color: "#9FD8E8",
    lines: ["고요함이 눈송이처럼 내려앉아요", "천천히, 아주 천천히 가라앉아요"],
  },
  {
    id: "longing",
    label: "그리움",
    engine: "leaves",
    color: "#D98A4B",
    lines: ["낙엽이 그리움처럼 흩날려요", "지나간 것들이 자꾸 마음에 내려요"],
  },
  {
    id: "joy",
    label: "기쁨",
    engine: "sparkle",
    color: "#FFC857",
    lines: ["가슴 속에서 반짝임이 번져요", "빛의 알갱이들이 위로 떠올라요"],
  },
  {
    id: "anger",
    label: "분노",
    engine: "storm",
    color: "#C4443B",
    lines: ["천둥이 가슴을 두드려요", "번개처럼 감정이 번쩍이고 지나가요"],
  },
];

// id로 감정 객체를 바로 찾기 위한 조회 테이블 (매번 배열을 find()로 뒤지지 않도록)
const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m]));

/* ---------- 공용 유틸 함수 ---------- */
// 값을 [a, b] 범위 안으로 눌러 담는다 (범위를 벗어난 계산값 보정용)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// a와 b 사이의 임의의 실수를 반환 (파티클 초기값 등에 사용)
const rand = (a, b) => a + Math.random() * (b - a);
// "#RRGGBB" 형태의 색을 "rgba(r,g,b,a)"로 변환 (그라디언트 등에서 투명도 조절용)
function hexToRgba(hex, a) {
  const v = hex.replace("#", ""); // 앞의 # 제거
  const r = parseInt(v.substring(0, 2), 16); // 앞 2자리 = red
  const g = parseInt(v.substring(2, 4), 16); // 중간 2자리 = green
  const b = parseInt(v.substring(4, 6), 16); // 뒤 2자리 = blue
  return `rgba(${r},${g},${b},${a})`;
}

/* ================================================================
   2. 날씨 엔진 모음
   ------------------------------------------------------------------
   각 엔진은 아래 4가지 함수(중 필요한 것)를 갖는다.
   - count       : 이 날씨가 사용할 파티클 개수
   - create(w,h) : 파티클 하나를 초기 상태로 만들어 반환
   - beforeStep  : (선택) 파티클 개별 계산 전에, 레이어 전체에 한 번만
                   적용할 공용 상태(태풍의 중심/반경 등)를 갱신
   - step(...)   : 파티클 하나를 한 프레임만큼 이동시킴
   - draw(...)   : 파티클 하나를 캔버스에 실제로 그림
   ================================================================ */
const ENGINES = {
  /* ---- 비 (슬픔) ---- */
  rain: {
    count: 220, // 빗방울 개수
    create: (w, h) => ({
      x: rand(0, w), // 화면 폭 안에서 임의의 시작 x
      y: rand(-h, h), // 화면 위쪽 바깥에서도 시작하도록 -h까지 허용 (처음부터 화면 가득 차 보이게)
      z: rand(0.3, 1), // 깊이감(0에 가까울수록 멀리 있는 빗방울 = 작고 느림)
      len: rand(10, 22), // 빗줄기 길이
    }),
    step: (p, w, h, dt, intensity) => {
      // intensity(0~1)가 커질수록 빗줄기가 굵고 빨라짐 (감정에 오래 머물수록 강해짐)
      const speed = (260 + intensity * 220) * p.z * dt;
      p.x += 40 * p.z * dt; // 살짝 대각선으로 떨어지도록 x도 함께 이동(바람 느낌)
      p.y += speed;
      if (p.y > h) {
        // 화면 아래로 나가면 위쪽으로 재배치 (무한 루프처럼 보이게)
        p.y = -20;
        p.x = rand(0, w);
        // 바닥에 닿았다는 이벤트를 리턴해서, 호출부에서 파문(splash)을 만들 수 있게 함
        return { splash: true, x: p.x, z: p.z };
      }
      return null; // 이벤트 없음
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = 0.25 + p.z * 0.35; // 가까운(z가 큰) 빗방울일수록 진하게
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.6, p.z * sizeScale);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 6 * p.z, p.y + p.len * p.z); // 짧은 대각선 = 빗줄기 한 획
      ctx.stroke();
      ctx.globalAlpha = 1; // 다음 그림에 영향 없도록 복원
    },
  },

  /* ---- 눈 (평온) ---- */
  snow: {
    count: 160,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(-h, h),
      z: rand(0.2, 1),
      wob: rand(0, Math.PI * 2), // 좌우로 흔들리는 위상값(sin 계산용 시작점)
    }),
    step: (p, w, h, dt, intensity) => {
      p.y += (18 + intensity * 20) * p.z * dt; // 눈은 비보다 훨씬 천천히 떨어짐
      p.wob += dt * 0.6; // 흔들림 위상을 서서히 진행
      p.x += Math.sin(p.wob) * 0.5; // sin 곡선을 따라 좌우로 살랑살랑
      if (p.y > h) {
        p.y = -10;
        p.x = rand(0, w);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = 0.35 + p.z * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, p.z * sizeScale * 1.6), 0, Math.PI * 2); // 눈송이 = 작은 원
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 태풍 (불안) ----
     불안을 "무엇 하나 또렷하지 않고, 중심을 잡을 수 없이 휘몰아치는" 느낌으로 표현.
     파티클들이 화면 중심으로 서서히 빨려 들어가며 소용돌이치다가(수렴 단계),
     주기적으로 한 번씩 바깥으로 터져 흩어진다(발산 단계) — 불안이 차오르다 터지는 것을 은유. */
  typhoon: {
    count: 260,
    create: (w, h) => ({
      angle: rand(0, Math.PI * 2), // 중심 기준 현재 각도
      radius: rand(0, Math.max(w, h) * 0.6), // 중심으로부터 거리
      z: rand(0.3, 1), // 깊이감(속도/굵기에 반영)
    }),
    // beforeStep은 "파티클 하나"가 아니라 "이 레이어 전체"에 대해 프레임마다 딱 한 번만 실행된다.
    // 태풍의 중심 좌표, 수렴/발산 사이클 진행도처럼 모든 파티클이 공유하는 값을 여기서 계산해서
    // layer.aux(파티클과 별개로 레이어에 딸린 보관함)에 저장해둔다.
    beforeStep: (layer, w, h, dt, intensity) => {
      const period = 9; // 한 번의 "수렴→발산" 사이클이 도는 데 걸리는 시간(초)
      layer.aux.cycle = (layer.aux.cycle || 0) + dt; // 누적 경과 시간
      const t = (layer.aux.cycle % period) / period; // 0~1 사이 사이클 진행률
      layer.aux.exploding = t > 0.75; // 사이클의 마지막 25% 구간에서만 "터짐" 상태
      // 현재 단계(수렴/발산) 안에서의 진행률(0~1)
      const phaseProgress = layer.aux.exploding ? (t - 0.75) / 0.25 : t / 0.75;
      // 수렴 단계에서는 시간이 지날수록(+오래 머물수록) 소용돌이가 강해짐
      layer.aux.intensity = layer.aux.exploding
        ? 1
        : clamp(phaseProgress + intensity * 0.3, 0, 1);
      // 소용돌이의 눈(중심 빈 공간) 반지름 — 강할수록 커짐
      layer.aux.coreRadius =
        30 + Math.pow(layer.aux.intensity, 3) * Math.min(w, h) * 0.28;
      layer.aux.cx = w / 2; // 태풍 중심 x = 화면 중앙
      layer.aux.cy = h / 2; // 태풍 중심 y = 화면 중앙
    },
    // aux: beforeStep에서 계산해둔 공용 상태를 전달받음
    step: (p, w, h, dt, intensity, aux) => {
      if (!aux.exploding) {
        // 수렴 단계: 각도를 계속 돌리면서, 반지름을 coreRadius 쪽으로 서서히 당김
        p.angle += dt * (0.6 + aux.intensity * 2.2) * p.z;
        p.radius += (aux.coreRadius - p.radius) * dt * 0.8;
      } else {
        // 발산 단계: 느리게 돌면서 반지름을 빠르게 키워 바깥으로 튕겨나가게 함
        p.angle += dt * 0.5 * p.z;
        p.radius += dt * (140 + intensity * 80) * p.z;
        if (p.radius > Math.max(w, h)) {
          // 화면 밖까지 나가면 다시 중심 근처에서 리스폰
          p.radius = rand(0, aux.coreRadius * 0.4);
          p.angle = rand(0, Math.PI * 2);
        }
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale, _grad, aux) => {
      // 파티클의 "직전 위치"를 살짝 계산해서, 점이 아니라 짧은 궤적 선으로 그려 속도감을 표현
      const stretch = aux.exploding ? -6 * p.z : (8 + aux.intensity * 24) * p.z;
      const prevAngle = p.angle - 0.04;
      const prevRadius = p.radius + stretch;
      const x0 = aux.cx + Math.cos(prevAngle) * prevRadius;
      const y0 = aux.cy + Math.sin(prevAngle) * prevRadius * 0.82; // *0.82 = 타원형 궤도(원근감)
      const x1 = aux.cx + Math.cos(p.angle) * p.radius;
      const y1 = aux.cy + Math.sin(p.angle) * p.radius * 0.82;
      ctx.globalAlpha =
        (aux.exploding ? 0.22 : 0.15 + aux.intensity * 0.55) *
        (0.4 + p.z * 0.6);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.6, p.z * sizeScale * 0.9);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 낙엽 (그리움) ---- */
  leaves: {
    count: 90,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(-h, h),
      z: rand(0.3, 1),
      rot: rand(0, Math.PI * 2), // 잎의 현재 회전각
      spin: rand(-1, 1), // 회전 속도/방향(음수면 반시계)
      wob: rand(0, Math.PI * 2), // 좌우 흔들림 위상
    }),
    step: (p, w, h, dt, intensity) => {
      p.y += (24 + intensity * 20) * p.z * dt;
      p.wob += dt;
      p.x += Math.sin(p.wob) * (18 + intensity * 10) * dt; // 바람에 흩날리듯 좌우로 크게 이동
      p.rot += p.spin * dt; // 회전은 낙하와 별개로 계속 진행
      if (p.y > h) {
        p.y = -10;
        p.x = rand(0, w);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      const s = Math.max(2, p.z * sizeScale * 2.2);
      ctx.save(); // 회전 변환이 다른 파티클에 영향 주지 않도록 상태 저장
      ctx.translate(p.x, p.y); // 파티클 위치로 좌표계 이동
      ctx.rotate(p.rot); // 잎의 회전각만큼 좌표계 회전
      ctx.globalAlpha = 0.4 + p.z * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); // 타원 = 잎 한 장
      ctx.fill();
      ctx.restore(); // translate/rotate 이전 상태로 복원
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 반짝임 (기쁨) ---- */
  sparkle: {
    count: 130,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(0, h),
      z: rand(0.2, 1),
      phase: rand(0, Math.PI * 2), // 깜빡임(twinkle) 위상
      speed: rand(6, 18), // 위로 떠오르는 속도
    }),
    step: (p, w, h, dt, intensity) => {
      p.y -= (p.speed + intensity * 10) * p.z * dt; // 위로 떠오름(음수 방향 이동)
      p.phase += dt * 3; // 깜빡임 속도
      if (p.y < -10) {
        // 화면 위로 사라지면 아래에서 다시 시작
        p.y = h + 10;
        p.x = rand(0, w);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      // sin값을 0~1로 정규화해서 밝기가 부드럽게 깜빡이도록(twinkle) 만듦
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.phase));
      ctx.globalAlpha = tw * (0.3 + p.z * 0.6);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, p.z * sizeScale * 1.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  },

  /* ---- 폭풍/번개 (분노) ---- */
  storm: {
    count: 200,
    create: (w, h) => ({
      x: rand(0, w),
      y: rand(-h, h),
      z: rand(0.4, 1),
      len: rand(16, 30),
    }),
    step: (p, w, h, dt, intensity) => {
      p.x += 60 * p.z * dt; // 폭풍우는 비보다 바람에 더 많이 밀림
      p.y += (340 + intensity * 260) * p.z * dt; // 낙하 속도도 훨씬 빠름
      if (p.y > h) {
        p.y = -20;
        p.x = rand(0, w);
      }
      return null;
    },
    draw: (ctx, p, color, sizeScale) => {
      ctx.globalAlpha = 0.2 + p.z * 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.6, p.z * sizeScale);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 8 * p.z, p.y + p.len * p.z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
};

/* ================================================================
   3. 번개 헬퍼 함수 (storm 엔진 전용 보조 효과)
   ------------------------------------------------------------------
   실제 번개를 관찰하면:
   - 메인 줄기가 위→아래로 불규칙하게 꺾이며 내려간다.
   - 중간중간 옆으로 짧은 곁가지(branch)가 갈라져 나온다.
   - 한 번에 사라지지 않고, 아주 짧은 시간 안에 "번쩍-살짝 꺼짐-한 번 더 번쩍"
     하는 이중 섬광(리턴 스트로크)을 보인다.
   아래 세 함수가 이 세 가지 특징을 각각 담당한다.
   ================================================================ */

// 메인 번개 줄기 + 곁가지들을 생성해서 반환
function makeBolt(w, h) {
  const startX = rand(w * 0.15, w * 0.85); // 화면 가장자리보다는 중앙 쪽에서 시작하게 범위 제한
  const path = [{ x: startX, y: 0 }]; // 번개가 지나가는 좌표들의 배열
  const branches = []; // 이 번개에서 갈라져 나온 곁가지들
  let x = startX;
  let y = 0;
  const steps = Math.ceil(h / 34); // 화면 높이에 맞춰 대략 34px 간격으로 꺾임

  for (let i = 0; i < steps && y < h; i++) {
    const progress = y / h; // 0(맨 위) ~ 1(맨 아래)
    // 아래로 내려갈수록(전류가 대기 중에 퍼지면서) 좌우 흔들림 폭이 커짐
    x += rand(-40, 40) * (0.6 + progress * 0.8);
    y += rand(26, 46);
    path.push({ x, y });

    // 줄기의 중간 구간(25%~70% 지점)에서만, 확률적으로 곁가지를 하나 만듦
    if (progress > 0.25 && progress < 0.7 && Math.random() < 0.22) {
      branches.push(makeBranch(x, y, w));
    }
  }
  return { path, branches, born: performance.now() }; // born = 이 번개가 태어난 시각(타임스탬프)
}

// 메인 줄기의 한 지점(startX, startY)에서 갈라지는 짧은 곁가지 하나를 생성
function makeBranch(startX, startY, w) {
  const dir = Math.random() < 0.5 ? -1 : 1; // 왼쪽으로 갈지 오른쪽으로 갈지 무작위 결정
  const path = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;
  const segs = Math.floor(rand(3, 6)); // 곁가지는 메인 줄기보다 훨씬 짧게 3~5구간만
  for (let i = 0; i < segs; i++) {
    x += dir * rand(14, 40); // 한쪽 방향으로 비스듬히 뻗어나감
    y += rand(18, 34);
    path.push({ x: clamp(x, 0, w), y }); // 화면 밖으로 나가지 않도록 x좌표를 클램프
  }
  return path;
}

// 번개가 태어난 뒤 경과 시간(ms)을 받아, 그 시점의 밝기(0~1)를 반환.
// 선형으로 서서히 사라지는 대신, 실제 번개처럼 "반짝-꺼짐-반짝-소멸"의 굴곡을 흉내낸다.
function boltAlpha(elapsedMs) {
  const t = elapsedMs / 260; // 번개 하나의 총 수명을 260ms로 잡고 0~1 진행률로 환산
  if (t >= 1) return 0; // 수명이 다하면 완전히 사라짐
  if (t < 0.08) return t / 0.08; // 0~8%: 아주 빠르게 최대 밝기까지 상승(섬광)
  if (t < 0.22) return 1; // 8~22%: 최대 밝기 유지
  if (t < 0.34) return 0.15; // 22~34%: 살짝 어두워짐(첫 번째 섬광 소멸)
  if (t < 0.5) return 0.8; // 34~50%: 리턴 스트로크로 다시 한번 밝아짐
  return 0.8 * (1 - (t - 0.5) / 0.5); // 50~100%: 서서히 완전히 소멸
}

/* ================================================================
   4. App 컴포넌트
   ================================================================ */
export default function EmotionWeatherGenerator() {
  const canvasRef = useRef(null); // 실제 그림을 그릴 <canvas> DOM 참조
  const wrapRef = useRef(null); // 전체 화면 크기를 재기 위한 바깥 컨테이너 참조
  const [selected, setSelected] = useState(null); // 현재 선택된 감정 id (UI 표시용)
  const [showHero, setShowHero] = useState(true); // 처음 안내 화면을 보여줄지 여부

  // 관람객마다 환경이 다를 수 있으므로, 시스템의 "동작 줄이기" 설정을 확인해서
  // 파티클 수/속도를 낮춰 어지러움이나 성능 저하를 줄인다.
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  // 애니메이션 도중 계속 바뀌는 값들(파티클 위치 등)은 굳이 React state로 관리하지 않고
  // ref 하나(scene)에 몰아넣는다. 이렇게 하면 프레임마다 값이 바뀌어도 리렌더가 발생하지 않아
  // 60fps 애니메이션 성능을 지킬 수 있다. (React state는 UI에 실제로 보여줘야 하는 값만 사용)
  const scene = useRef({
    curr: null, // 현재 재생 중인 날씨 레이어
    prev: null, // 감정 전환 중일 때, 페이드아웃되고 있는 이전 날씨 레이어
    transitionT: 1, // 전환 진행률(0=막 전환 시작, 1=전환 완료)
    lastFrame: 0, // 직전 프레임의 타임스탬프(dt 계산용)
  });

  // 하나의 "날씨 레이어"를 새로 만드는 함수.
  // 레이어 = { 어떤 감정인지, 파티클 배열, 파문/번개 같은 부가 이펙트 배열, 시작 시각, aux(엔진 전용 공용 상태) }
  const buildLayer = useCallback((moodId, w, h) => {
    const mood = MOOD_MAP[moodId];
    const engine = ENGINES[mood.engine];
    // 동작 줄이기 모드에서는 파티클 수를 절반으로 줄여 부하를 낮춤
    const n = reducedMotion.current
      ? Math.round(engine.count * 0.5)
      : engine.count;
    return {
      moodId,
      particles: Array.from({ length: n }, () => engine.create(w, h)),
      splashes: [], // 비/폭풍 낙수 파문 이펙트들
      bolts: [], // 폭풍의 번개들
      aux: {}, // 태풍처럼 파티클 개별이 아닌 "레이어 전체"가 공유하는 상태를 담는 자리
      startedAt: performance.now(), // 이 감정에 머물기 시작한 시각(체류 강도 계산용)
    };
  }, []);

  // 관람객이 감정 버튼을 눌렀을 때 실행됨
  const selectMood = useCallback(
    (moodId) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setSelected(moodId); // UI(캡션, 활성 버튼 표시)를 위한 state 갱신
      setShowHero(false); // 안내 화면을 닫고 날씨를 보여줌
      const s = scene.current;
      if (s.curr && s.curr.moodId !== moodId) {
        // 이미 다른 날씨가 재생 중이었다면, 그것을 prev로 넘기고 서서히 사라지게 함
        s.prev = s.curr;
        s.transitionT = 0; // 0부터 다시 크로스페이드 시작
      } else if (!s.curr) {
        // 첫 선택이면 전환 없이 곧바로 100% 보이게
        s.transitionT = 1;
      }
      s.curr = buildLayer(moodId, canvas.width, canvas.height); // 새 날씨 레이어 생성
    },
    [buildLayer]
  );

  /* ---- 캔버스 렌더링 루프 ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf; // requestAnimationFrame id (정리할 때 취소하기 위해 보관)

    // 창 크기(또는 컨테이너 크기)에 맞춰 캔버스의 실제 픽셀 크기를 갱신
    const resize = () => {
      const wrap = wrapRef.current;
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // 레이어 하나(현재 날씨 또는 전환 중인 이전 날씨)를 실제로 그리는 함수
    // alpha = 이 레이어를 얼마나 진하게 보여줄지(크로스페이드용)
    const renderLayer = (layer, w, h, alpha, now, dt) => {
      if (!layer) return 0; // 레이어가 없으면 아무것도 그리지 않고, 번개 밝기 0을 반환
      const mood = MOOD_MAP[layer.moodId];
      const engine = ENGINES[mood.engine];
      // 이 감정에 머문 시간(0~20초를 0~1로 정규화) → 오래 머물수록 날씨가 짙어짐
      const dwell = clamp((now - layer.startedAt) / 20000, 0, 1);
      const speedMul = reducedMotion.current ? 0.35 : 1; // 동작 줄이기 모드면 전체 속도를 낮춤

      ctx.save(); // 이 레이어를 그리는 동안의 캔버스 상태(투명도 등)를 스택에 저장
      ctx.globalAlpha = alpha;

      // 태풍처럼 "레이어 전체가 공유하는 상태"가 필요한 엔진은 beforeStep을 먼저 한 번 실행
      if (engine.beforeStep) {
        engine.beforeStep(layer, w, h, dt * speedMul, dwell);
      }

      // 파티클 하나하나를 이동시키고(step) 그린다(draw)
      layer.particles.forEach((p) => {
        const evt = engine.step(p, w, h, dt * speedMul, dwell, layer.aux);
        // step이 "바닥에 떨어졌다" 같은 이벤트를 반환하면, 파문 이펙트를 하나 추가
        if (evt?.splash)
          layer.splashes.push({ x: evt.x, y: h - 2, r: 1, life: 1, z: evt.z });
        engine.draw(ctx, p, mood.color, 2, null, layer.aux);
      });

      // 비/폭풍에서만: 바닥에 닿은 자리에 번지는 파문(동심원) 그리기
      if (mood.engine === "rain" || mood.engine === "storm") {
        for (let i = layer.splashes.length - 1; i >= 0; i--) {
          const sp = layer.splashes[i];
          sp.r += 40 * dt; // 파문이 시간에 따라 커짐
          sp.life -= dt * 2.2; // 동시에 서서히 옅어짐
          if (sp.life <= 0) {
            layer.splashes.splice(i, 1); // 다 사라진 파문은 배열에서 제거
            continue;
          }
          ctx.globalAlpha = alpha * sp.life * 0.5;
          ctx.strokeStyle = mood.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          // 완전한 원 대신 살짝 눌린 타원으로 그려서 "바닥에서 튄" 느낌을 줌
          ctx.ellipse(
            sp.x,
            sp.y,
            sp.r * sp.z,
            sp.r * 0.35 * sp.z,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
      }

      let maxBoltAlpha = 0; // 이번 프레임에 그려진 번개 중 가장 밝은 값(화면 섬광 세기 결정용)

      // 폭풍(분노)에서만: 번개 생성 + 그리기
      if (mood.engine === "storm") {
        // 동작 줄이기 모드가 아니고, 체류 시간이 길수록 조금 더 자주 번개가 침
        if (!reducedMotion.current && Math.random() < 0.008 * (0.5 + dwell)) {
          layer.bolts.push(makeBolt(w, h));
        }
        for (let i = layer.bolts.length - 1; i >= 0; i--) {
          const b = layer.bolts[i];
          const a = boltAlpha(now - b.born); // 이 번개의 현재 밝기(이중 섬광 곡선 적용)
          if (a <= 0) {
            layer.bolts.splice(i, 1); // 수명이 다한 번개는 제거
            continue;
          }
          maxBoltAlpha = Math.max(maxBoltAlpha, a);

          // 메인 줄기: 밝고 두껍게, 은은한 색 발광(shadowBlur) 추가
          ctx.globalAlpha = alpha * a;
          ctx.strokeStyle = "#F3E9FF"; // 번개 고유색은 거의 흰색에 가까운 푸른빛
          ctx.shadowColor = mood.color;
          ctx.shadowBlur = 16;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(b.path[0].x, b.path[0].y);
          b.path.forEach((pt) => ctx.lineTo(pt.x, pt.y));
          ctx.stroke();

          // 곁가지: 메인 줄기보다 얇고 어둡게 그려서 "덜 강한 전류"처럼 보이게
          ctx.lineWidth = 1;
          ctx.globalAlpha = alpha * a * 0.55;
          b.branches.forEach((branch) => {
            ctx.beginPath();
            ctx.moveTo(branch[0].x, branch[0].y);
            branch.forEach((pt) => ctx.lineTo(pt.x, pt.y));
            ctx.stroke();
          });
          ctx.shadowBlur = 0; // 다음 그림에 발광 효과가 새어나가지 않도록 초기화
        }

        // 번개가 친 순간, 화면 전체가 살짝 하얗게 번쩍이는 효과를 캔버스에 직접 그림
        // (DOM에 별도 엘리먼트/상태를 두지 않아 리액트 리렌더 없이 번개와 완벽히 동기화됨)
        if (maxBoltAlpha > 0) {
          ctx.globalAlpha = alpha * maxBoltAlpha * 0.22;
          ctx.fillStyle = "#F3E9FF";
          ctx.fillRect(0, 0, w, h);
        }
      }

      ctx.restore(); // 이 레이어를 그리기 전 상태로 캔버스를 되돌림
      return maxBoltAlpha;
    };

    // 매 프레임 실행되는 메인 루프
    const loop = (now) => {
      const w = canvas.width;
      const h = canvas.height;
      const s = scene.current;
      // 직전 프레임과의 시간 차이(초 단위). 너무 큰 값(탭 전환 등)은 0.05초로 제한
      const dt = s.lastFrame
        ? Math.min(0.05, (now - s.lastFrame) / 1000)
        : 0.016;

      ctx.clearRect(0, 0, w, h); // 이전 프레임 지우기

      // 바탕색: 감정을 고르기 전이나 후나 늘 어두운 중립톤에서 시작
      ctx.fillStyle = "#0A0A0D";
      ctx.fillRect(0, 0, w, h);

      // 현재 감정 색을 화면 중앙에서 아주 옅게 퍼지는 빛으로 깔아 분위기(공기감)를 더함
      const activeMood = s.curr ? MOOD_MAP[s.curr.moodId] : null;
      if (activeMood) {
        const g = ctx.createRadialGradient(
          w / 2,
          h * 0.35,
          0,
          w / 2,
          h * 0.6,
          Math.max(w, h) * 0.8
        );
        g.addColorStop(0, hexToRgba(activeMood.color, 0.08));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // 감정 전환 중이면 이전 레이어(옅어지는 중)와 새 레이어(짙어지는 중)를 함께 그려 크로스페이드
      if (s.transitionT < 1) {
        s.transitionT = Math.min(1, s.transitionT + 0.02); // 프레임마다 전환 진행률을 조금씩 채움
        renderLayer(s.prev, w, h, 1 - s.transitionT, now, dt);
        renderLayer(s.curr, w, h, s.transitionT, now, dt);
        if (s.transitionT >= 1) s.prev = null; // 전환이 끝나면 이전 레이어는 완전히 폐기
      } else {
        renderLayer(s.curr, w, h, 1, now, dt);
      }

      s.lastFrame = now; // 다음 프레임의 dt 계산을 위해 이번 시각을 저장
      raf = requestAnimationFrame(loop); // 다음 프레임 예약
    };
    raf = requestAnimationFrame(loop);

    // 컴포넌트가 사라질 때 애니메이션과 이벤트 리스너를 정리(메모리 누수 방지)
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []); // 빈 배열: 이 useEffect는 최초 마운트 시 한 번만 실행 → 슬라이더/버튼 조작이 캔버스를 재시작시키지 않음

  /* ---- 전시회 키오스크 기능: 일정 시간 조작이 없으면 다음 관람객을 위해 처음 화면으로 복귀 ---- */
  useEffect(() => {
    if (!selected || showHero) return; // 아직 아무것도 안 골랐거나 이미 안내 화면이면 타이머 불필요
    const IDLE_MS = 45000; // 45초 동안 새로운 선택이 없으면 초기화
    const timer = setTimeout(() => setShowHero(true), IDLE_MS);
    return () => clearTimeout(timer); // 새로 선택하거나 언마운트되면 이전 타이머를 취소
  }, [selected, showHero]);

  /* ---- 전시회 키오스크 기능: 전체화면 전환 (브라우저가 키오스크 모드로 세팅되지 않은 경우 대비) ---- */
  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.().catch(() => {}); // 권한 거부 등으로 실패해도 조용히 무시
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const mood = selected ? MOOD_MAP[selected] : null; // 현재 선택된 감정 객체(없으면 null)

  return (
    <div ref={wrapRef} className="ew-root">
      {/* 날씨가 실제로 그려지는 캔버스 */}
      <canvas ref={canvasRef} className="ew-canvas" />

      {/* 감정에 어울리는 시적 캡션 (화면 왼쪽 아래) */}
      {mood && !showHero && (
        <div className="ew-caption" aria-live="polite">
          <span className="ew-caption-mood" style={{ color: mood.color }}>
            {mood.label}
          </span>
          <p className="ew-caption-line">{mood.lines[0]}</p>
          <p className="ew-caption-line ew-caption-line--sub">
            {mood.lines[1]}
          </p>
        </div>
      )}

      {/* 왼쪽 위: 처음 화면으로 돌아가기 + 전체화면 전환 (관람객 교체 시 관리자/다음 관람객이 사용) */}
      {!showHero && (
        <div className="ew-toolbar">
          <button className="ew-chip" onClick={() => setShowHero(true)}>
            다시 고르기
          </button>
          <button
            className="ew-chip ew-chip--icon"
            onClick={toggleFullscreen}
            aria-label="전체화면 전환"
          >
            ⤢
          </button>
        </div>
      )}

      {/* 히어로(초기 안내) 오버레이 */}
      <div className={`ew-hero ${showHero ? "ew-hero--visible" : ""}`}>
        <p className="ew-hero-eyebrow">EMOTION WEATHER</p>
        <h1 className="ew-hero-title">
          오늘, 마음의 날씨는
          <br />
          어떤가요
        </h1>
        <p className="ew-hero-sub">
          아래에서 감정을 골라 보세요. 그 마음이 화면 위의 날씨가 되어요
        </p>
      </div>

      {/* 감정 스펙트럼: 히어로 화면일 땐 중앙 근처, 선택 후에는 하단에 고정 */}
      <div
        className={`ew-spectrum ${
          showHero ? "ew-spectrum--hero" : "ew-spectrum--dock"
        }`}
      >
        <div className="ew-spectrum-line" />
        {MOODS.map((m) => (
          <button
            key={m.id}
            className={`ew-mood ${selected === m.id ? "ew-mood--active" : ""} ${
              showHero ? "ew-mood--pulse" : ""
            }`}
            style={{ "--mood-color": m.color }}
            onClick={() => selectMood(m.id)}
            aria-pressed={selected === m.id}
          >
            <span className="ew-mood-dot" />
            <span className="ew-mood-label">{m.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        /* 감정 스펙트럼의 문구/제목에는 감성적인 세리프체(Fraunces),
           작은 라벨/버튼에는 깔끔한 산세리프(Inter)를 사용해 위계를 나눔 */
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Inter:wght@400;500&display=swap');

        .ew-root {
          position: relative;
          width: 100%;
          height: 100vh;
          min-height: 560px;
          overflow: hidden;
          background: #0A0A0D;
          font-family: 'Inter', system-ui, sans-serif;
          color: #F5F1EC;
          /* 전시회 키오스크(터치스크린) 대응: 확대/드래그/길게 눌러 메뉴 뜨는 것 방지 */
          touch-action: manipulation;
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }
        .ew-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

        /* ---- 히어로(초기 안내) 오버레이 ---- */
        .ew-hero {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 0 24px;
          opacity: 0; pointer-events: none; /* 평소엔 안 보이고 클릭도 통과시킴 */
          transition: opacity 0.7s ease;
          background: radial-gradient(ellipse at center, rgba(10,10,13,0.2) 0%, rgba(10,10,13,0.75) 75%);
        }
        .ew-hero--visible { opacity: 1; pointer-events: auto; } /* 보일 때만 클릭 가능하게 */
        .ew-hero-eyebrow {
          font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: 4px;
          color: #9A968E; margin: 0 0 18px;
        }
        .ew-hero-title {
          font-family: 'Fraunces', serif; font-weight: 300; font-optical-sizing: auto;
          font-size: clamp(32px, 6vw, 56px); line-height: 1.18; margin: 0 0 18px; color: #F5F1EC;
        }
        .ew-hero-sub { font-size: 14px; color: #B9B4AB; margin: 0; max-width: 380px; }

        /* ---- 시적 캡션 ---- */
        .ew-caption {
          position: absolute; left: 40px; bottom: 132px; max-width: 340px;
          pointer-events: none; /* 캡션이 뒤쪽 캔버스 클릭을 막지 않도록 */
        }
        .ew-caption-mood {
          font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: 3px; font-weight: 500;
          display: block; margin-bottom: 10px; text-transform: uppercase;
        }
        .ew-caption-line {
          font-family: 'Fraunces', serif; font-weight: 300; font-size: 22px; line-height: 1.5;
          margin: 0; color: #F5F1EC;
        }
        .ew-caption-line--sub { color: #9A968E; font-size: 16px; margin-top: 4px; }

        /* ---- 왼쪽 위 툴바(다시 고르기 / 전체화면) ---- */
        .ew-toolbar { position: absolute; top: 24px; left: 24px; display: flex; gap: 8px; }
        .ew-chip {
          background: rgba(20,20,24,0.5); border: 1px solid rgba(245,241,236,0.14);
          color: #B9B4AB; font-size: 12px; letter-spacing: 1px;
          padding: 12px 18px; border-radius: 100px; cursor: pointer;
          backdrop-filter: blur(6px); transition: all 0.2s ease;
          min-height: 44px; /* 터치 스크린에서도 정확히 누를 수 있도록 최소 44px 확보 */
        }
        .ew-chip--icon { padding: 12px 16px; font-size: 16px; min-width: 44px; }
        .ew-chip:hover, .ew-chip:active { color: #F5F1EC; border-color: rgba(245,241,236,0.3); }
        .ew-chip:focus-visible { outline: 2px solid #F5F1EC; outline-offset: 2px; }

        /* ---- 감정 스펙트럼 바 ---- */
        .ew-spectrum {
          position: absolute; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 22px;
          transition: bottom 0.7s cubic-bezier(0.4,0,0.2,1), gap 0.5s ease;
        }
        .ew-spectrum--hero { bottom: 96px; gap: 28px; }
        .ew-spectrum--dock { bottom: 40px; gap: 20px; }
        .ew-spectrum-line {
          position: absolute; left: -16px; right: -16px; top: 5px; height: 1px;
          /* 각 감정의 실제 색을 순서대로 이어 붙인 그라디언트 = "감정의 지평선" */
          background: linear-gradient(90deg, #8A9180, #6C7A96, #9FD8E8, #D98A4B, #FFC857, #C4443B);
          opacity: 0.35; z-index: 0;
        }

        .ew-mood {
          position: relative; z-index: 1;
          background: transparent; border: none; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          /* 터치 타겟을 넉넉하게: 실제 보이는 점은 작아도, 누를 수 있는 영역은 44px 이상 확보 */
          padding: 14px 10px; min-width: 44px; min-height: 44px;
          color: #9A968E;
        }
        .ew-mood-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--mood-color); opacity: 0.45;
          box-shadow: 0 0 0 0 transparent;
          transition: opacity 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
        }
        .ew-mood:hover .ew-mood-dot { opacity: 0.8; transform: scale(1.2); }
        .ew-mood--active .ew-mood-dot {
          opacity: 1; transform: scale(1.35);
          box-shadow: 0 0 16px 2px var(--mood-color);
        }
        /* 아무도 조작하지 않는 대기(attract) 상태일 때, 점들이 아주 은은하게 숨쉬듯 깜빡여
           관람객의 시선을 끄는 역할을 함 */
        .ew-mood--pulse .ew-mood-dot { animation: ew-pulse 2.6s ease-in-out infinite; }
        .ew-mood--pulse:nth-child(2) .ew-mood-dot { animation-delay: 0.3s; }
        .ew-mood--pulse:nth-child(3) .ew-mood-dot { animation-delay: 0.6s; }
        .ew-mood--pulse:nth-child(4) .ew-mood-dot { animation-delay: 0.9s; }
        .ew-mood--pulse:nth-child(5) .ew-mood-dot { animation-delay: 1.2s; }
        .ew-mood--pulse:nth-child(6) .ew-mood-dot { animation-delay: 1.5s; }
        @keyframes ew-pulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.15); }
        }

        .ew-mood-label {
          font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: 1px;
          transition: color 0.25s ease;
        }
        .ew-mood:hover .ew-mood-label,
        .ew-mood--active .ew-mood-label { color: #F5F1EC; }
        .ew-mood:focus-visible { outline: 2px solid #F5F1EC; outline-offset: 4px; border-radius: 4px; }

        /* ---- 작은 화면(모바일/세로형 키오스크) 대응 ---- */
        @media (max-width: 640px) {
          .ew-spectrum { gap: 10px !important; }
          .ew-mood-label { font-size: 10px; }
          .ew-caption { left: 20px; bottom: 112px; max-width: 78vw; }
          .ew-caption-line { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
