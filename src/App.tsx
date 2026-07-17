import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Auth } from './components/Auth';

const obstacleTypes = ['bird', 'plane', 'trash', 'human', 'apple', 'banana', 'orange', 'grape', 'barrier'] as const;

type ObstacleType = (typeof obstacleTypes)[number];

type ObstacleLevel = 'top' | 'top-middle' | 'middle' | 'middle-bottom' | 'bottom';
type ObstacleSpeed = 'slow' | 'normal' | 'fast';

type Obstacle = {
  id: number;
  type: ObstacleType;
  level: ObstacleLevel;
  speed: ObstacleSpeed;
  spawnedAt: number;
  hit: boolean;
  worldLeft: number;
  travelMultiplier: number;
  spawnTop?: number;
  barrierSide?: 'top' | 'bottom';
  barrierHeight?: number;
  barrierWidth?: number;
};

const obstacleClassNames: Record<ObstacleType, string> = {
  bird: 'city-obstacle city-obstacle--bird',
  plane: 'city-obstacle city-obstacle--plane',
  trash: 'city-obstacle city-obstacle--trash',
  human: 'city-obstacle city-obstacle--human',
  apple: 'city-obstacle city-obstacle--apple',
  banana: 'city-obstacle city-obstacle--banana',
  orange: 'city-obstacle city-obstacle--orange',
  grape: 'city-obstacle city-obstacle--grape',
  barrier: 'city-obstacle city-obstacle--barrier',
};

const obstacleLevelClassNames: Record<ObstacleLevel, string> = {
  top: 'city-obstacle--top',
  'top-middle': 'city-obstacle--top-middle',
  middle: 'city-obstacle--middle',
  'middle-bottom': 'city-obstacle--middle-bottom',
  bottom: 'city-obstacle--bottom',
};

const obstacleSpeedClassNames: Record<ObstacleSpeed, string> = {
  slow: 'city-obstacle--slow',
  normal: 'city-obstacle--normal',
  fast: 'city-obstacle--fast',
};

const villageHouses = [
  { id: 0, left: '6%', width: '74px', height: '50px', scale: 0.78 },
  { id: 1, left: '15%', width: '58px', height: '42px', scale: 1.06 },
  { id: 2, left: '26%', width: '82px', height: '56px', scale: 0.94 },
  { id: 3, left: '40%', width: '64px', height: '46px', scale: 1.18 },
  { id: 4, left: '54%', width: '88px', height: '60px', scale: 0.84 },
  { id: 5, left: '69%', width: '62px', height: '44px', scale: 1.02 },
  { id: 6, left: '80%', width: '76px', height: '52px', scale: 0.72 },
  { id: 7, left: '90%', width: '56px', height: '40px', scale: 1.12 },
];

const alpineChunks = Array.from({ length: 20 }, (_, index) => index);

const fruitTypes = new Set<ObstacleType>(['apple', 'banana', 'orange', 'grape']);
const fruitChoices: Extract<ObstacleType, 'apple' | 'banana' | 'orange' | 'grape'>[] = ['apple', 'banana', 'orange', 'grape'];
const groundChoices: Extract<ObstacleType, 'bird' | 'trash' | 'human'>[] = ['bird', 'trash', 'human'];
const fruitLaneTops: Record<ObstacleLevel, number> = {
  top: 84,
  'top-middle': 146,
  middle: 208,
  'middle-bottom': 270,
  bottom: 332,
};
const WORLD_LOOKAHEAD = 20000;
const OBSTACLE_DESPAWN_BEHIND = 6000;
const LEVEL_START_AHEAD = {
  easy: 120,
  normal: 260,
  hard: 420,
} as const;
const LEVEL_CONFIG = {
  easy: { count: 3, gapMin: 45, gapMax: 110, initialAhead: 120, offscreenBuffer: 35 },
  normal: { count: 3, gapMin: 90, gapMax: 170, initialAhead: 220, offscreenBuffer: 55 },
  hard: { count: 2, gapMin: 85, gapMax: 160, initialAhead: 420, offscreenBuffer: 55 },
} as const;
const getSpawnLead = (progress: number) =>
  Math.min(window.innerWidth * 0.22 + progress * 0.015, window.innerWidth * 0.55);

const START_PLANE_POSITION = { x: 120, y: 180 };
const getViewportProfile = () => {
  const width = window.innerWidth;

  return {
    isMobile: width <= 768,
    planeBounds: width <= 768
      ? { width: 132, height: 46, padding: 14 }
      : { width: 164, height: 56, padding: 18 },
    planeScale: width <= 768 ? 0.8 : 1,
    planeScreenX: width <= 768
      ? Math.min(width * 0.08, width - 132 - 14)
      : Math.min(width * 0.22, width - 164 - 18),
    normalGap: width <= 768 ? { min: 280, max: 360 } : { min: 260, max: 340 },
    normalWidth: width <= 768 ? 84 : NORMAL_PIPE_WIDTH,
    normalSpacing: width <= 768 ? [90, 120, 160, 200] as const : [80, 110, 150, 190] as const,
  };
};

const obstacleHitboxPadding: Record<ObstacleType, number> = {
  bird: 12,
  plane: 12,
  trash: 10,
  human: 10,
  apple: 12,
  banana: 12,
  orange: 8,
  grape: 12,
  barrier: 16,
};

const obstacleHitboxPaddingByLevel: Record<'easy' | 'normal' | 'hard', number> = {
  easy: 8,
  normal: 10,
  hard: 12,
};

const NORMAL_PIPE_WIDTH = 96;
const NORMAL_EXTRA_TRAVEL_MULTIPLIER: Record<ObstacleSpeed, number> = {
  slow: 1.7,
  normal: 2,
  fast: 2.35,
};

export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<'easy' | 'normal' | 'hard'>('easy');
  const [gameLost, setGameLost] = useState(false);
  const [levelComplete, setLevelComplete] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const nextIdRef = useRef(1);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const obstacleElementRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const skyRef = useRef<HTMLDivElement | null>(null);
  const [forwardProgress, setForwardProgress] = useState(0);
  const [fruitTrails, setFruitTrails] = useState<Array<{ id: number; left: number; top: number; color: string }>>([]);
  const [planePosition, setPlanePosition] = useState(() => ({
    x: START_PLANE_POSITION.x,
    y: START_PLANE_POSITION.y,
  }));
  const viewportProfile = getViewportProfile();
  const { isMobile, planeBounds, planeScale, planeScreenX, normalGap, normalWidth, normalSpacing } = viewportProfile;
  const cameraX = forwardProgress;
  const cameraY = planePosition.y - START_PLANE_POSITION.y;
  const sceneStyle = {
    '--camera-x': `${cameraX}px`,
  } as CSSProperties;
  const backgroundStyle = {
    '--bg-offset-x': `${cameraX}px`,
    '--bg-offset-y': `${cameraY}px`,
  } as CSSProperties;
  const [obstacles, setObstacles] = useState<Obstacle[]>([
    {
      id: 0,
      type: 'bird',
      level: 'middle',
      speed: 'normal',
      spawnedAt: performance.now(),
      hit: false,
      worldLeft: 120,
      travelMultiplier: 1,
    },
  ]);
  const [planeExploded, setPlaneExploded] = useState(false);
  const [fallingObstacleId, setFallingObstacleId] = useState<number | null>(null);
  const isHardLevel = selectedLevel === 'hard';
  const isNormalLevel = selectedLevel === 'normal';
  const isEasyLevel = selectedLevel === 'easy';
  const visibleObstacles = obstacles.filter((obstacle) => {
    const screenLeft = obstacle.worldLeft - forwardProgress;
    const margin = isMobile ? 88 : 120;
    return screenLeft > -margin && screenLeft < window.innerWidth + margin;
  });
  const planeHitRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
  const fallTimerRef = useRef<number | null>(null);
  const nextSpawnProgressRef = useRef(0);
  const lastSpawnLeftRef = useRef(0);
  const crashPointRef = useRef<{ planeLeft: number; planeTop: number; obstacleLeft: number; obstacleTop: number } | null>(null);
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const draggingRef = useRef(false);

  const clampPlanePosition = (x: number, y: number) => {
    const maxY = Math.max(window.innerHeight - planeBounds.height - planeBounds.padding, planeBounds.padding);
    const maxX = Math.max(window.innerWidth - planeBounds.width - planeBounds.padding, planeBounds.padding);

    return {
      x: Math.min(Math.max(x, planeBounds.padding), maxX),
      y: Math.min(Math.max(y, planeBounds.padding), maxY),
    };
  };

  const resetGame = (options?: { keepLevel?: boolean }) => {
    setGameStarted(false);
    setShowSignIn(false);
    setShowLevels(false);
    if (!options?.keepLevel) {
      setSelectedLevel('easy');
    }
    setGameLost(false);
    setLevelComplete(false);
    setGamePaused(false);
    setPlaneExploded(false);
    setFallingObstacleId(null);
    setPlanePosition({
      x: START_PLANE_POSITION.x,
      y: START_PLANE_POSITION.y,
    });
    setForwardProgress(0);
    nextSpawnProgressRef.current = 0;
    lastSpawnLeftRef.current = 0;
    setFruitTrails([]);
    setObstacles([]);
    planeHitRef.current = false;
    crashPointRef.current = null;
    keysRef.current = { up: false, down: false, left: false, right: false };
    draggingRef.current = false;

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    if (fallTimerRef.current !== null) {
      window.clearTimeout(fallTimerRef.current);
      fallTimerRef.current = null;
    }
  };

  const getNextLevel = () => {
    if (selectedLevel === 'easy') {
      return 'normal' as const;
    }

    if (selectedLevel === 'normal') {
      return 'hard' as const;
    }

    return 'hard' as const;
  };

  const buildObstacle = (
    choice: ObstacleType,
    levelChoice: ObstacleLevel,
    speedChoice: ObstacleSpeed,
    worldLeft: number,
    overrides?: Partial<Pick<Obstacle, 'barrierSide' | 'barrierHeight' | 'barrierWidth'>>,
  ): Obstacle => ({
    id: nextIdRef.current++,
    type: choice,
    level: levelChoice,
    speed: speedChoice,
    spawnedAt: performance.now(),
    hit: false,
    worldLeft,
    travelMultiplier: choice === 'plane' ? 1.8 : choice === 'bird' ? 1.15 : 1,
    spawnTop: fruitTypes.has(choice)
      ? fruitLaneTops[levelChoice] + (Math.random() * 46 - 23)
      : undefined,
    barrierSide: choice === 'barrier' ? (Math.random() < 0.5 ? 'top' : 'bottom') : undefined,
    barrierHeight: choice === 'barrier'
      ? Math.floor(180 + Math.random() * 260)
      : undefined,
    barrierWidth: choice === 'barrier'
      ? [78, 94, 112, 132][Math.floor(Math.random() * 4)]
      : undefined,
    ...overrides,
  });

  const buildEasyObstacle = (worldLeft: number, speedChoice: ObstacleSpeed) => {
    const easyChoices: ObstacleType[] = [
      'bird',
      'trash',
      'human',
      'apple',
      'banana',
      'orange',
      'grape',
    ];
    const easyLevels: ObstacleLevel[] = [
      'top',
      'top-middle',
      'middle',
      'middle-bottom',
      'bottom',
      'bottom',
      'bottom',
      'middle-bottom',
    ];

    return buildObstacle(
      easyChoices[Math.floor(Math.random() * easyChoices.length)],
      easyLevels[Math.floor(Math.random() * easyLevels.length)],
      speedChoice,
      worldLeft,
    );
  };

  const spawnObstacleBatch = (baseProgress: number) => {
    const difficulty = LEVEL_CONFIG[selectedLevel];
    const startClearance = selectedLevel === 'hard' && lastSpawnLeftRef.current === 0 ? 400 : 0;
    const count = selectedLevel === 'hard' ? difficulty.count + 1 : difficulty.count;
    const levels: ObstacleLevel[] = ['top', 'top-middle', 'middle', 'middle-bottom', 'bottom'];
    const easyLevels: ObstacleLevel[] = [
      'top',
      'top-middle',
      'middle',
      'middle-bottom',
      'bottom',
      'bottom',
      'bottom',
      'middle-bottom',
    ];
    const speeds: ObstacleSpeed[] = ['slow', 'normal', 'fast'];
    const next: Obstacle[] = [];
    const minAhead = baseProgress + (
      lastSpawnLeftRef.current === 0
        ? difficulty.initialAhead + startClearance
        : getSpawnLead(baseProgress)
    );
    const startLeft = Math.max(
      minAhead,
      lastSpawnLeftRef.current + difficulty.gapMin,
    ) + difficulty.offscreenBuffer;

    let cursorLeft = startLeft;

    while (next.length < count) {
      const levelChoice = selectedLevel === 'easy'
        ? easyLevels[Math.floor(Math.random() * easyLevels.length)]
        : levels[Math.floor(Math.random() * levels.length)];
      const speedIndex = Math.floor(Math.random() * speeds.length);
      const choice: ObstacleType = Math.random() < 0.25
        ? 'plane'
        : Math.random() < 0.6
          ? fruitChoices[Math.floor(Math.random() * fruitChoices.length)]
          : groundChoices[Math.floor(Math.random() * groundChoices.length)];
      const easyChoice: ObstacleType = Math.random() < 0.8
        ? groundChoices[Math.floor(Math.random() * groundChoices.length)]
        : fruitChoices[Math.floor(Math.random() * fruitChoices.length)];
      const obstacleChoice = selectedLevel === 'easy' ? easyChoice : choice;

      if (selectedLevel === 'normal' || selectedLevel === 'hard') {
        const gapHeight = Math.floor(
          normalGap.min + Math.random() * (normalGap.max - normalGap.min),
        );
        const minPipeHeight = 120;
        const maxTopHeight = Math.max(
          minPipeHeight,
          Math.floor(window.innerHeight - gapHeight - minPipeHeight),
        );
        const floorBiasMin = Math.max(
          minPipeHeight,
          Math.floor(maxTopHeight * 0.62),
        );
        const topHeight = Math.max(
          floorBiasMin,
          Math.floor(
            floorBiasMin + Math.random() * Math.max(1, maxTopHeight - floorBiasMin),
          ),
        );
        const bottomHeight = Math.max(0, window.innerHeight - topHeight - gapHeight + 48);
        const pipeWidth = normalWidth + [0, 0, 12, 18][Math.floor(Math.random() * 4)];
        next.push(
          buildObstacle('barrier', levelChoice, speeds[speedIndex], cursorLeft, {
            barrierSide: 'top',
            barrierHeight: topHeight,
            barrierWidth: pipeWidth,
          }),
          buildObstacle('barrier', levelChoice, speeds[speedIndex], cursorLeft, {
            barrierSide: 'bottom',
            barrierHeight: bottomHeight,
            barrierWidth: pipeWidth,
          }),
        );

        if (selectedLevel === 'normal' && Math.random() < 0.95) {
          const extraChoice = Math.random() < 0.5
            ? fruitChoices[Math.floor(Math.random() * fruitChoices.length)]
            : groundChoices[Math.floor(Math.random() * groundChoices.length)];
          const extraLevel = levels[Math.floor(Math.random() * levels.length)];
          const extraObstacle = buildObstacle(
            extraChoice,
            extraLevel,
            speeds[speedIndex],
            cursorLeft + pipeWidth * 0.55,
          );

          next.push({
            ...extraObstacle,
            travelMultiplier: NORMAL_EXTRA_TRAVEL_MULTIPLIER[speeds[speedIndex]],
            spawnTop: fruitTypes.has(extraChoice)
              ? Math.max(
                  Math.floor(window.innerHeight * 0.58),
                  Math.min(
                    window.innerHeight - 96,
                    topHeight + gapHeight * 0.72 + (Math.random() * 120 - 40),
                  ),
                )
              : extraObstacle.spawnTop,
          });
        }

        cursorLeft += normalSpacing[Math.floor(Math.random() * normalSpacing.length)];
        if (selectedLevel === 'hard') {
          next.push(
            buildEasyObstacle(
              cursorLeft + Math.floor(pipeWidth * 0.35),
              speeds[speedIndex],
            ),
          );
        } else {
          continue;
        }

        cursorLeft += difficulty.gapMin;
        continue;
      }

      const obstacle = buildObstacle(obstacleChoice, levelChoice, speeds[speedIndex], cursorLeft);
      next.push(obstacle);
      cursorLeft += difficulty.gapMin;
    }

    lastSpawnLeftRef.current = next[next.length - 1]?.worldLeft ?? startLeft;
    nextSpawnProgressRef.current =
      lastSpawnLeftRef.current +
      difficulty.gapMin +
      Math.random() * (difficulty.gapMax - difficulty.gapMin);
    setObstacles((current) => [...current, ...next]);
  };

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    setObstacles([]);
    lastSpawnLeftRef.current = 0;
    nextSpawnProgressRef.current = forwardProgress + LEVEL_START_AHEAD[selectedLevel];
    while (nextSpawnProgressRef.current < forwardProgress + WORLD_LOOKAHEAD) {
      spawnObstacleBatch(nextSpawnProgressRef.current);
    }

    return () => undefined;
  }, [gameStarted, gamePaused, selectedLevel]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    if (forwardProgress < nextSpawnProgressRef.current) {
      return;
    }

    while (forwardProgress + WORLD_LOOKAHEAD > nextSpawnProgressRef.current) {
      spawnObstacleBatch(nextSpawnProgressRef.current);
    }
  }, [forwardProgress, gameStarted, gamePaused]);

  useEffect(() => {
    if (!gameStarted || gamePaused || gameLost || levelComplete) {
      return;
    }

    if (forwardProgress < 30000) {
      return;
    }

    setGamePaused(true);
    setPlaneExploded(false);
    planeHitRef.current = false;
    setLevelComplete(true);
  }, [forwardProgress, gameStarted, gamePaused, gameLost, levelComplete]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    const skyElement = skyRef.current;
    if (!skyElement || planeExploded) {
      return;
    }

    const planeHeight = isMobile ? 24 : 28;

    const updateFromPointer = (_clientX: number, clientY: number) => {
      setPlanePosition((current) =>
        clampPlanePosition(current.x, clientY - planeHeight / 2),
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      draggingRef.current = true;
      skyElement.setPointerCapture(event.pointerId);
      updateFromPointer(event.clientX, event.clientY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current && event.pointerType !== 'mouse') {
        return;
      }

      updateFromPointer(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      draggingRef.current = false;
      if (skyElement.hasPointerCapture(event.pointerId)) {
        skyElement.releasePointerCapture(event.pointerId);
      }
    };

    skyElement.addEventListener('pointerdown', onPointerDown);
    skyElement.addEventListener('pointermove', onPointerMove);
    skyElement.addEventListener('pointerup', onPointerUp);
    skyElement.addEventListener('pointercancel', onPointerUp);

    return () => {
      skyElement.removeEventListener('pointerdown', onPointerDown);
      skyElement.removeEventListener('pointermove', onPointerMove);
      skyElement.removeEventListener('pointerup', onPointerUp);
      skyElement.removeEventListener('pointercancel', onPointerUp);
    };
  }, [planeExploded, gameStarted, gamePaused]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    obstaclesRef.current = obstacles;
  }, [obstacles, gameStarted, gamePaused]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
      }

      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        keysRef.current.up = true;
      }
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        keysRef.current.down = true;
      }
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        keysRef.current.left = true;
      }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        keysRef.current.right = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        keysRef.current.up = false;
      }
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        keysRef.current.down = false;
      }
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        keysRef.current.left = false;
      }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        keysRef.current.right = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameStarted, gamePaused]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    if (planeExploded) {
      return;
    }

    const speed = isHardLevel ? 6.5 : 2.6;
    const turnSpeed = isHardLevel ? 28 : 2.4;
    const forwardSpeed = isHardLevel ? 3.8 : 1.9;

    let frame = 0;
    let lastTime = performance.now();

    const movePlane = (now: number) => {
      const delta = Math.min((now - lastTime) / 16.67, 2);
      lastTime = now;

      const { up, down, left, right } = keysRef.current;
      const yDirection = (down ? 1 : 0) - (up ? 1 : 0);
      const xDirection = (right ? 1 : 0) - (left ? 1 : 0);

      setForwardProgress((current) => current + forwardSpeed * delta);
      setPlanePosition((current) =>
        clampPlanePosition(
          current.x + xDirection * turnSpeed * delta,
          current.y + yDirection * speed * delta,
        ),
      );

      frame = window.requestAnimationFrame(movePlane);
    };

    frame = window.requestAnimationFrame(movePlane);

    return () => window.cancelAnimationFrame(frame);
  }, [planeExploded, gameStarted, gamePaused, isHardLevel]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    const checkCollisions = () => {
      let hitDetected = false;

      const planeElement = planeRef.current;
      const planeRect = planeElement?.getBoundingClientRect() ?? null;

      if (!planeRect) {
        return;
      }

      const inflateRect = (rect: DOMRect, amount: number) => ({
        left: rect.left - amount,
        right: rect.right + amount,
        top: rect.top - amount,
        bottom: rect.bottom + amount,
      });

      const getOverlap = (
        a: { left: number; right: number; top: number; bottom: number },
        b: { left: number; right: number; top: number; bottom: number },
      ) => ({
        width: Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)),
        height: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
      });

      const planeHitRect = inflateRect(planeRect, -6);

      const nextObstacles = obstaclesRef.current.map((obstacle) => {
      if (obstacle.hit) {
        return obstacle;
      }

        const obstacleElement = obstacleElementRefs.current[obstacle.id];
        const obstacleRect = obstacleElement?.getBoundingClientRect() ?? null;

        if (!obstacleRect) {
          return obstacle;
        }

        const obstacleHitRect = inflateRect(
          obstacleRect,
          -(obstacleHitboxPadding[obstacle.type] + obstacleHitboxPaddingByLevel[selectedLevel]),
        );
        const overlap = getOverlap(obstacleHitRect, planeHitRect);
        const isTouching = overlap.width > 0 && overlap.height > 0;

        if (isTouching) {
          hitDetected = true;
          console.log(`Hit obstacle: ${obstacle.type}`);
          crashPointRef.current = {
            planeLeft: planeRect.left,
            planeTop: planeRect.top,
            obstacleLeft: obstacleRect.left,
            obstacleTop: obstacleRect.top,
          };
          const isDeadlyOrange = obstacle.type === 'orange' && isHardLevel;

          if (fruitTypes.has(obstacle.type) && !isDeadlyOrange) {
            const fruitColorMap: Record<Extract<ObstacleType, 'apple' | 'banana' | 'orange' | 'grape'>, string> = {
              apple: '#d63c33',
              banana: '#f4b93a',
              orange: '#ff8c1a',
              grape: '#7c4cf0',
            };

            setFruitTrails((current) => [
              ...current,
              {
                id: obstacle.id,
                left: planeRect.left,
                top: planeRect.top + planeRect.height / 2,
                color: fruitColorMap[obstacle.type as Extract<ObstacleType, 'apple' | 'banana' | 'orange' | 'grape'>],
              },
            ]);
          }
          return { ...obstacle, hit: true };
        }

        return obstacle;
      });

      const culledObstacles = nextObstacles.filter(
        (obstacle) => obstacle.worldLeft >= forwardProgress - OBSTACLE_DESPAWN_BEHIND,
      );

      if (hitDetected || culledObstacles.length !== obstaclesRef.current.length) {
        obstaclesRef.current = culledObstacles;
        setObstacles(culledObstacles);
      }

      if (hitDetected && !planeHitRef.current) {
        const hitObstacle = nextObstacles.find((obstacle) => obstacle.hit);
        planeHitRef.current = true;
        setPlaneExploded(true);
        setFallingObstacleId(hitObstacle?.id ?? null);

        if (resetTimerRef.current !== null) {
          window.clearTimeout(resetTimerRef.current);
        }

        if (fallTimerRef.current !== null) {
          window.clearTimeout(fallTimerRef.current);
        }

        resetTimerRef.current = window.setTimeout(() => {
      setPlaneExploded(false);
      planeHitRef.current = false;
      resetTimerRef.current = null;
      setGameLost(true);
    }, 650);

        fallTimerRef.current = window.setTimeout(() => {
          setFallingObstacleId(null);
          fallTimerRef.current = null;
        }, 1200);
      }
    };

    let frame = 0;
    const loop = () => {
      checkCollisions();
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      if (fallTimerRef.current !== null) {
        window.clearTimeout(fallTimerRef.current);
      }
    };
  }, [gameStarted, gamePaused]);

  if (!gameStarted) {
    return (
      <main className="main-screen">
        <div className="main-topbar">
          <button type="button" className="ghost main-topbar__button" onClick={() => setGameStarted(true)}>
            Play as guest
          </button>
          <button type="button" className="ghost main-topbar__button" onClick={() => setShowSignIn(true)}>
            Sign in
          </button>
        </div>
        <div className="main-stage" aria-hidden="true">
          <div className="main-stage__grid" />
          <div className="main-stage__orb main-stage__orb--one" />
          <div className="main-stage__orb main-stage__orb--two" />
          <div className="main-stage__beam" />
          <div className="main-stage__plane-swoosh" />
        </div>
        <section className="main-hero">
          <p className="main-kicker">City Flight</p>
          <h1 className="main-title" aria-label="Plane Dodger">
            <span>PLANE</span>
            <span className="main-title__plane" aria-hidden="true">
              <span className="main-title__plane-body" />
              <span className="main-title__plane-wing" />
              <span className="main-title__plane-tail" />
              <span className="main-title__plane-nose" />
              <span className="main-title__plane-window" />
              <span className="main-title__plane-engine" />
            </span>
            <span>DODGER</span>
          </h1>
          <p className="main-text">
            Dodge the obstacles, survive longer, and try not to crash into the city.
          </p>
          <div className="main-actions">
            <button type="button" onClick={() => setGameStarted(true)}>
              Start Game
            </button>
            <button type="button" className="main-actions__secondary" onClick={() => setShowLevels(true)}>
              Levels
            </button>
          </div>
          <div className="main-stats">
            <div>
              <strong>Controls</strong>
              <span>Mouse, touch, or arrow keys</span>
            </div>
            <div>
              <strong>Goal</strong>
              <span>Stay in the air as long as possible</span>
            </div>
          </div>
        </section>
        {showSignIn && (
          <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Sign in">
            <div className="auth-overlay__backdrop" onClick={() => setShowSignIn(false)} />
            <div className="auth-overlay__panel">
              <button
                type="button"
                className="ghost auth-overlay__close"
                onClick={() => setShowSignIn(false)}
              >
                Close
              </button>
              <Auth />
            </div>
          </div>
        )}
        {showLevels && (
          <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Levels">
            <div className="auth-overlay__backdrop" onClick={() => setShowLevels(false)} />
            <div className="auth-overlay__panel">
              <button
                type="button"
                className="ghost auth-overlay__close"
                onClick={() => setShowLevels(false)}
              >
                Close
              </button>
              <section className="card levels-card">
                <h2>Levels</h2>
                <p className="main-text">Pick a level to start the game. Easy is the one we just tuned.</p>
                <div className="levels-grid">
                  <button
                    type="button"
                    className="level-tile level-tile--easy"
                    onClick={() => {
                      setSelectedLevel('easy');
                      setShowLevels(false);
                      setGameStarted(true);
                    }}
                  >
                    <strong>Easy</strong>
                    <span>More space, fewer obstacles</span>
                  </button>
                  <button
                    type="button"
                    className="level-tile"
                    onClick={() => {
                      setSelectedLevel('normal');
                      setShowLevels(false);
                      setGameStarted(true);
                    }}
                  >
                    <strong>Normal</strong>
                    <span>Current game balance</span>
                  </button>
                  <button
                    type="button"
                    className="level-tile"
                    onClick={() => {
                      setSelectedLevel('hard');
                      setShowLevels(false);
                      setGameStarted(true);
                    }}
                  >
                    <strong>Hard</strong>
                    <span>Faster spawns and tighter gaps</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (gameLost) {
    return (
      <main className="lose-screen">
        <div className="lose-card">
          <p className="lose-kicker">Plane Dodger</p>
          <h1>YOU LOSE</h1>
          <p>You crashed into an obstacle. Try again and see how far you can fly.</p>
          <div className="lose-actions">
            <button type="button" onClick={() => resetGame()}>
              Back to menu
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                resetGame({ keepLevel: true });
                setGameStarted(true);
              }}
            >
              Play again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (levelComplete) {
    return (
      <main className="lose-screen">
        <div className="lose-card">
          <p className="lose-kicker">Plane Dodger</p>
          <h1>LEVEL COMPLETE</h1>
          <p>You reached 10,000 px. Ready for the next challenge?</p>
          <div className="lose-actions">
            <button type="button" onClick={() => resetGame()}>
              Back to menu
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const nextLevel = getNextLevel();
                resetGame({ keepLevel: true });
                setSelectedLevel(nextLevel);
                setGameStarted(true);
              }}
              disabled={selectedLevel === 'hard'}
            >
              {selectedLevel === 'hard' ? 'No next level' : 'Next level'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`city-page${isHardLevel ? ' city-page--hard' : ''}`} style={backgroundStyle}>
      <div className="city-scene" style={sceneStyle}>
        {isNormalLevel || isEasyLevel ? (
          <div className="city-sunset-bg" aria-hidden="true">
            <div className="city-sunset-bg__sun" />
            <div className="city-sunset-bg__cloud city-sunset-bg__cloud--one" />
            <div className="city-sunset-bg__cloud city-sunset-bg__cloud--two" />
            <div className="city-sunset-bg__cloud city-sunset-bg__cloud--three" />
            <div className="city-sunset-bg__glow" />
            <div className="city-sunset-bg__ground" />
          </div>
        ) : isHardLevel ? (
          <div className="city-mountains" aria-hidden="true">
            {Array.from({ length: 20 }).map((_, index) => (
              <div
                key={index}
                className="city-mountains__chunk"
                style={{ left: `${index * 100}%` }}
              >
                <div className="city-mountains__range city-mountains__range--far" />
                <div className="city-mountains__range city-mountains__range--near" />
              </div>
            ))}
          </div>
        ) : null}
        <div className="city-alps" aria-hidden="true">
          {alpineChunks.map((chunk) => (
            <div key={chunk} className="city-alps__chunk" style={{ left: `${chunk * 100}%` }}>
              <div className="city-alps__peaks city-alps__peaks--back" />
              <div className="city-alps__peaks city-alps__peaks--front" />
              <div className="city-village" aria-hidden="true">
                {villageHouses.map((house) => (
                  <div
                    key={`${chunk}-${house.id}`}
                    className="city-village__house"
                    style={{
                      left: house.left,
                      width: house.width,
                      height: house.height,
                      transform: `scale(${house.scale})`,
                    }}
                  >
                    <span className="city-village__roof" />
                    <span className="city-village__chimney" />
                    <span className="city-village__window city-village__window--left" />
                    <span className="city-village__window city-village__window--right" />
                    <span className="city-village__door" />
                  </div>
                ))}
              </div>
              <div className="city-field" />
            </div>
          ))}
        </div>
        <div className="city-sky" aria-hidden="true" ref={skyRef}>
        {obstacles.map((obstacle) => (
          <div
            key={obstacle.id}
            ref={(element) => {
              if (element) {
                obstacleElementRefs.current[obstacle.id] = element;
              } else {
                delete obstacleElementRefs.current[obstacle.id];
              }
            }}
            className={`${obstacleClassNames[obstacle.type]} ${obstacleLevelClassNames[obstacle.level]} ${obstacleSpeedClassNames[obstacle.speed]}${obstacle.hit && fallingObstacleId === obstacle.id ? ' city-obstacle--falling' : ''}`}
            style={
              obstacle.hit && fallingObstacleId === obstacle.id
                ? ({
                    left: `${crashPointRef.current?.obstacleLeft ?? 0}px`,
                    top: `${crashPointRef.current?.obstacleTop ?? 0}px`,
                  } as CSSProperties)
                : ({
                    left: `${obstacle.worldLeft - forwardProgress * obstacle.travelMultiplier * (isHardLevel ? 2 : 1)}px`,
                    top: obstacle.type === 'barrier'
                      ? obstacle.barrierSide === 'top'
                        ? '0px'
                        : undefined
                      : fruitTypes.has(obstacle.type) && obstacle.spawnTop !== undefined
                        ? `${obstacle.spawnTop}px`
                        : undefined,
                    bottom: obstacle.type === 'barrier'
                      ? obstacle.barrierSide === 'bottom'
                        ? '0px'
                        : undefined
                      : undefined,
                    height: obstacle.type === 'barrier'
                      ? `${obstacle.barrierHeight ?? 240}px`
                      : undefined,
                    width: obstacle.type === 'barrier'
                      ? `${obstacle.barrierWidth ?? 96}px`
                      : undefined,
                  } as CSSProperties)
            }
          >
            {obstacle.type === 'bird' && <div className="city-obstacle__bird" />}
            {obstacle.type === 'plane' && <div className="city-obstacle__mini-plane" />}
            {obstacle.type === 'trash' && <div className="city-obstacle__trash-can" />}
            {obstacle.type === 'human' && <div className="city-obstacle__human" />}
            {obstacle.type === 'apple' && <div className="city-obstacle__fruit city-obstacle__fruit--apple" />}
            {obstacle.type === 'banana' && <div className="city-obstacle__fruit city-obstacle__fruit--banana" />}
            {obstacle.type === 'orange' && <div className="city-obstacle__fruit city-obstacle__fruit--orange" />}
            {obstacle.type === 'grape' && <div className="city-obstacle__fruit city-obstacle__fruit--grape" />}
            {obstacle.type === 'barrier' && <div className="city-obstacle__barrier" />}
          </div>
        ))}
        <div className="city-sun" />
        <div className="city-cloud city-cloud--one" />
        <div className="city-cloud city-cloud--two" />
        <div className="city-window-glow city-window-glow--one" />
        <div className="city-window-glow city-window-glow--two" />
        <div className="city-window-glow city-window-glow--three" />
        <div className="city-line city-line--one" />
        <div className="city-line city-line--two" />
        </div>
      </div>
      <div className="city-fruit-trail" aria-hidden="true">
        {fruitTrails.map((trail) => (
          <span
            key={trail.id}
            className="city-fruit-trail__mark"
            style={{ left: `${trail.left}px`, top: `${trail.top}px`, background: trail.color }}
          />
        ))}
      </div>
      <div className="city-menu">
        <button type="button" className="ghost city-menu__back" onClick={() => resetGame()}>
          Back to menu
        </button>
        <button
          type="button"
          className="ghost city-menu__pause"
          onClick={() => setGamePaused((current) => !current)}
        >
          {gamePaused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <div className="city-debug" aria-live="polite">
        <div><strong>Progress</strong><span>{Math.floor(forwardProgress)} px</span></div>
        <div><strong>Total</strong><span>{obstacles.length}</span></div>
        <div><strong>Visible</strong><span>{visibleObstacles.length}</span></div>
        <div><strong>Next spawn</strong><span>{Math.floor(nextSpawnProgressRef.current)}</span></div>
      </div>
      <div className="city-plane-layer" aria-hidden="true">
        {gamePaused && (
          <div className="city-pause-banner">
            <strong>Paused</strong>
            <span>Press Resume to keep flying.</span>
          </div>
        )}
        <div
          ref={planeRef}
          className={`city-plane-modern${planeExploded ? ' city-plane-modern--exploded' : ''}`}
          style={
            planeExploded && crashPointRef.current
              ? ({
                  left: `${crashPointRef.current.planeLeft}px`,
                  top: `${crashPointRef.current.planeTop}px`,
                } as CSSProperties)
                : ({
                  left: `${planeScreenX + (planePosition.x - START_PLANE_POSITION.x)}px`,
                  top: `${planePosition.y}px`,
                  '--plane-scale': planeScale,
                } as CSSProperties)
          }
        >
          <div className="city-plane-modern__trail" />
          <div className="city-plane-modern__body">
            <div className="city-plane-modern__cockpit" />
            <div className="city-plane-modern__window-row">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="city-plane-modern__wing" />
            <div className="city-plane-modern__tail" />
            <div className="city-plane-modern__engine city-plane-modern__engine--left" />
            <div className="city-plane-modern__engine city-plane-modern__engine--right" />
          </div>
          <div className="city-plane-modern__fin" />
          {planeExploded && (
            <div className="city-plane-modern__explosion" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
