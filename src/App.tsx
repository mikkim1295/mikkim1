import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Auth } from './components/Auth';
import { MobileControls, type MobileControlDirection } from './components/MobileControls';

const obstacleTypes = ['bird', 'plane', 'trash', 'human', 'apple', 'banana', 'orange', 'grape', 'barrier', 'coin', 'spike', 'block', 'pad'] as const;

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
  verticalDrift?: number;
  spawnProgress?: number;
  barrierSide?: 'top' | 'bottom';
  barrierHeight?: number;
  barrierWidth?: number;
  coinValue?: number;
  planeEmblem?: string;
  planeStyle?: PlaneStyle;
};

type PlaneStyle = 'standard' | 'stealth' | 'razor' | 'bomber' | 'ember';

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
  coin: 'city-obstacle city-obstacle--coin',
  spike: 'city-obstacle city-obstacle--spike',
  block: 'city-obstacle city-obstacle--block',
  pad: 'city-obstacle city-obstacle--pad',
};

const PLANE_EMBLEMS = ['🔥', '💀', '⚡', '😈'] as const;
const PLANE_STYLES: PlaneStyle[] = ['standard', 'stealth', 'razor', 'bomber', 'ember'];

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
const WORLD_LOOKAHEAD = 100000;
const OBSTACLE_DESPAWN_BEHIND = 100000;
const CAVE_INTRO_DISTANCE = 50000;
const LEVEL_START_AHEAD = {
  easy: 120,
  normal: 0,
  hard: 420,
} as const;
const LEVEL_CONFIG = {
  easy: { count: 3, gapMin: 45, gapMax: 110, initialAhead: 120, offscreenBuffer: 35 },
  normal: { count: 3, gapMin: 70, gapMax: 120, initialAhead: 0, offscreenBuffer: 0 },
  hard: { count: 3, gapMin: 70, gapMax: 120, initialAhead: 360, offscreenBuffer: 40 },
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
    normalGap: width <= 768 ? { min: 240, max: 320 } : { min: 220, max: 300 },
    normalWidth: width <= 768 ? 84 : NORMAL_PIPE_WIDTH,
    normalSpacing: width <= 768 ? [90, 120, 160, 200] as const : [80, 110, 150, 190] as const,
  };
};

const obstacleHitboxPadding: Record<ObstacleType, number> = {
  bird: 4,
  plane: 12,
  trash: 10,
  human: 10,
  apple: 0,
  banana: 12,
  orange: 8,
  grape: 12,
  barrier: 16,
  coin: 8,
  spike: 8,
  block: 8,
  pad: 4,
};

const obstacleHitboxPaddingByLevel: Record<'easy' | 'normal' | 'hard', number> = {
  easy: 0,
  normal: 8,
  hard: 10,
};

const NORMAL_PIPE_WIDTH = 96;
const PLANE_SKINS = [
  { id: 'classic', name: 'Classic', cost: 0 },
  { id: 'sunrise', name: 'Sunrise', cost: 2 },
  { id: 'midnight', name: 'Midnight', cost: 4 },
  { id: 'aurora', name: 'Aurora', cost: 6 },
  { id: 'ember', name: 'Ember', cost: 8 },
  { id: 'obsidian', name: 'Obsidian', cost: 10 },
  { id: 'polar', name: 'Polar', cost: 12 },
  { id: 'cosmic', name: 'Cosmic', cost: 14 },
  { id: 'venom', name: 'Venom', cost: 16 },
  { id: 'royal', name: 'Royal', cost: 18 },
  { id: 'sunfire', name: 'Sunfire', cost: 20 },
  { id: 'titan', name: 'Titan', cost: 22 },
  { id: 'reef', name: 'Reef', cost: 24 },
  { id: 'comet', name: 'Comet', cost: 26 },
] as const;

type PlaneSkinId = (typeof PLANE_SKINS)[number]['id'];
const PLANE_SKIN_STORAGE_KEY = 'plane-dodger-skin';
const OWNED_SKINS_STORAGE_KEY = 'plane-dodger-owned-skins';
const BEST_DISTANCE_STORAGE_KEY = 'plane-dodger-best-distance';
const COINS_STORAGE_KEY = 'plane-dodger-coins';
const TOTAL_DISTANCE_STORAGE_KEY = 'plane-dodger-total-distance';
const SKIN_PLAY_COUNTS_STORAGE_KEY = 'plane-dodger-skin-play-counts';
const SCREEN_BRIGHTNESS_STORAGE_KEY = 'plane-dodger-screen-brightness';
const COIN_REWARD_STEP = 1000;
const LEVEL_COMPLETE_DISTANCE = 100000;
const SCREEN_BRIGHTNESS_MIN = 0.7;
const SCREEN_BRIGHTNESS_MAX = 1.2;
const PORTAL_APPEAR_DISTANCE = CAVE_INTRO_DISTANCE;

const clampScreenBrightness = (value: number) =>
  Math.min(SCREEN_BRIGHTNESS_MAX, Math.max(SCREEN_BRIGHTNESS_MIN, value));

export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<'easy' | 'normal' | 'hard'>('easy');
  const [selectedSkin, setSelectedSkin] = useState<PlaneSkinId>(() => {
    const savedSkin = window.localStorage.getItem(PLANE_SKIN_STORAGE_KEY);
    return PLANE_SKINS.some((skin) => skin.id === savedSkin) ? (savedSkin as PlaneSkinId) : 'classic';
  });
  const [ownedSkins, setOwnedSkins] = useState<PlaneSkinId[]>(() => {
    const savedOwnedSkins = window.localStorage.getItem(OWNED_SKINS_STORAGE_KEY);
    if (!savedOwnedSkins) {
      return ['classic'];
    }

    try {
      const parsedOwnedSkins = JSON.parse(savedOwnedSkins) as unknown;
      if (!Array.isArray(parsedOwnedSkins)) {
        return ['classic'];
      }

      return parsedOwnedSkins.filter((skin): skin is PlaneSkinId => PLANE_SKINS.some((item) => item.id === skin));
    } catch {
      return ['classic'];
    }
  });
  const [bestDistance, setBestDistance] = useState(() => {
    const savedDistance = window.localStorage.getItem(BEST_DISTANCE_STORAGE_KEY);
    const parsedDistance = Number(savedDistance);
    return Number.isFinite(parsedDistance) ? parsedDistance : 0;
  });
  const [coins, setCoins] = useState(() => {
    const savedCoins = window.localStorage.getItem(COINS_STORAGE_KEY);
    const parsedCoins = Number(savedCoins);
    return Number.isFinite(parsedCoins) ? parsedCoins : 0;
  });
  const [totalDistance, setTotalDistance] = useState(() => {
    const savedTotalDistance = window.localStorage.getItem(TOTAL_DISTANCE_STORAGE_KEY);
    const parsedTotalDistance = Number(savedTotalDistance);
    return Number.isFinite(parsedTotalDistance) ? parsedTotalDistance : 0;
  });
  const [skinPlayCounts, setSkinPlayCounts] = useState<Record<PlaneSkinId, number>>(() => {
    const initialCounts = PLANE_SKINS.reduce((accumulator, skin) => {
      accumulator[skin.id] = 0;
      return accumulator;
    }, {} as Record<PlaneSkinId, number>);

    const savedCounts = window.localStorage.getItem(SKIN_PLAY_COUNTS_STORAGE_KEY);
    if (!savedCounts) {
      return initialCounts;
    }

    try {
      const parsedCounts = JSON.parse(savedCounts) as Record<string, number>;
      return PLANE_SKINS.reduce((accumulator, skin) => {
        const value = parsedCounts[skin.id];
        accumulator[skin.id] = Number.isFinite(value) ? value : 0;
        return accumulator;
      }, initialCounts);
    } catch {
      return initialCounts;
    }
  });
  const [screenBrightness, setScreenBrightness] = useState(() => {
    const savedBrightness = window.localStorage.getItem(SCREEN_BRIGHTNESS_STORAGE_KEY);
    const parsedBrightness = Number(savedBrightness);
    return Number.isFinite(parsedBrightness) ? clampScreenBrightness(parsedBrightness) : 1;
  });
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
  const { isMobile, planeBounds, planeScale, planeScreenX, normalWidth, normalSpacing } = viewportProfile;
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
  const [godMode, setGodMode] = useState(false);
  const gameMode: 'flight' | 'dash' = window.location.hash === '#dash' ? 'dash' : 'flight';
  const isHardLevel = selectedLevel === 'hard';
  const isNormalLevel = selectedLevel === 'normal';
  const isEasyLevel = selectedLevel === 'easy';
  const coinCount = coins;
  const nextCoinMilestoneRef = useRef(COIN_REWARD_STEP);
  const runStartProgressRef = useRef(0);
  const isSkinOwned = (skinId: PlaneSkinId) => ownedSkins.includes(skinId);
  const buySkin = (skinId: PlaneSkinId, cost: number) => {
    if (isSkinOwned(skinId) || coins < cost) {
      return;
    }

    setCoins((current) => current - cost);
    setOwnedSkins((current) => {
      const nextOwned = [...current, skinId];
      return nextOwned;
    });
    setSelectedSkin(skinId);
  };
  const planeShopOverlay = showShop ? (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Plane shop">
      <div className="auth-overlay__backdrop" onClick={() => setShowShop(false)} />
      <div className="auth-overlay__panel">
        <button
          type="button"
          className="ghost auth-overlay__close"
          onClick={() => setShowShop(false)}
        >
          Close
        </button>
        <section className="card levels-card">
          <h2>Plane Shop</h2>
          <p className="main-text">Buy skins with coins, then equip the one you want.</p>
          <div className="plane-shop-grid">
            {PLANE_SKINS.map((skin) => {
              const owned = isSkinOwned(skin.id);
              const active = selectedSkin === skin.id;
              const canBuy = coins >= skin.cost;

              return (
                <button
                  key={skin.id}
                  type="button"
                  className={`plane-skin-card${active ? ' plane-skin-card--active' : ''}${owned ? '' : ' plane-skin-card--locked'}`}
                  onClick={() => {
                    if (owned) {
                      setSelectedSkin(skin.id);
                    } else if (canBuy) {
                      buySkin(skin.id, skin.cost);
                    }
                  }}
                  disabled={!owned && !canBuy}
                >
                  <span className={`plane-skin-card__preview plane-skin-card__preview--${skin.id}`} aria-hidden="true">
                    <span className={`plane-skin-card__sticker plane-skin-card__sticker--${skin.id}`} />
                    <span className="plane-skin-card__preview-body" />
                    <span className="plane-skin-card__preview-wing" />
                    <span className="plane-skin-card__preview-fin" />
                    <span className="plane-skin-card__preview-stripe" />
                  </span>
                  <strong>{skin.name}</strong>
                  <span>
                    {owned
                      ? (active ? 'Equipped' : 'Tap to equip')
                      : `Buy for ${skin.cost} coins`}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="plane-shop-footer">Coins: {coins}</p>
        </section>
      </div>
    </div>
  ) : null;
  const favoriteSkin = PLANE_SKINS.reduce<PlaneSkinId>((bestSkin, skin) => {
    return skinPlayCounts[skin.id] > skinPlayCounts[bestSkin] ? skin.id : bestSkin;
  }, 'classic');
  const settingsOverlay = showSettings ? (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="auth-overlay__backdrop" onClick={() => setShowSettings(false)} />
      <div className="auth-overlay__panel">
        <button
          type="button"
          className="ghost auth-overlay__close"
          onClick={() => setShowSettings(false)}
        >
          Close
        </button>
        <section className="card levels-card settings-card">
          <h2>Settings</h2>
          <p className="main-text">Your flight stats and screen look.</p>
          <div className="settings-grid">
            <div className="settings-stat">
              <strong>Total flown</strong>
              <span>{Math.floor(totalDistance)} px</span>
            </div>
            <div className="settings-stat">
              <strong>Best run</strong>
              <span>{Math.floor(bestDistance)} px</span>
            </div>
            <div className="settings-stat">
              <strong>Favorite skin</strong>
              <span>{favoriteSkin}</span>
            </div>
          </div>
          <label className="settings-slider">
            <span>Screen lightness</span>
              <input
                type="range"
                min={SCREEN_BRIGHTNESS_MIN}
                max={SCREEN_BRIGHTNESS_MAX}
                step="0.01"
                value={screenBrightness}
                onChange={(event) => setScreenBrightness(clampScreenBrightness(Number(event.target.value)))}
              />
            </label>
        </section>
      </div>
    </div>
  ) : null;
  const visibleObstacles = obstacles.filter((obstacle) => {
    const screenLeft = obstacle.worldLeft - forwardProgress;
    const margin = isMobile ? 88 : 120;
    return screenLeft > -margin && screenLeft < window.innerWidth + margin;
  });
  const showMobileControls = isMobile && gameStarted && !gamePaused && !gameLost && !levelComplete;
  const planeHitRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
  const fallTimerRef = useRef<number | null>(null);
  const forwardProgressRef = useRef(0);
  const nextSpawnProgressRef = useRef(0);
  const lastSpawnLeftRef = useRef(0);
  const collisionFrameRef = useRef(0);
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

  const setMovementKey = (direction: MobileControlDirection, pressed: boolean) => {
    keysRef.current[direction] = pressed;
  };

  const resetGame = (options?: { keepLevel?: boolean }) => {
    setGameStarted(false);
    setShowSignIn(false);
    setShowLevels(false);
    setShowShop(false);
    setShowSettings(false);
    if (!options?.keepLevel) {
      setSelectedLevel('easy');
    }
    setGameLost(false);
    setLevelComplete(false);
    setGamePaused(false);
    setPlaneExploded(false);
    setFallingObstacleId(null);
    setGodMode(false);
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
    collisionFrameRef.current = 0;
    crashPointRef.current = null;
    nextCoinMilestoneRef.current = COIN_REWARD_STEP;
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

  useEffect(() => {
    window.localStorage.setItem(PLANE_SKIN_STORAGE_KEY, selectedSkin);
  }, [selectedSkin]);

  useEffect(() => {
    window.localStorage.setItem(BEST_DISTANCE_STORAGE_KEY, String(bestDistance));
  }, [bestDistance]);

  useEffect(() => {
    window.localStorage.setItem(COINS_STORAGE_KEY, String(coins));
  }, [coins]);

  useEffect(() => {
    window.localStorage.setItem(TOTAL_DISTANCE_STORAGE_KEY, String(totalDistance));
  }, [totalDistance]);

  useEffect(() => {
    window.localStorage.setItem(OWNED_SKINS_STORAGE_KEY, JSON.stringify(ownedSkins));
  }, [ownedSkins]);

  useEffect(() => {
    window.localStorage.setItem(SKIN_PLAY_COUNTS_STORAGE_KEY, JSON.stringify(skinPlayCounts));
  }, [skinPlayCounts]);

  useEffect(() => {
    window.localStorage.setItem(SCREEN_BRIGHTNESS_STORAGE_KEY, String(screenBrightness));
  }, [screenBrightness]);

  useEffect(() => {
    document.documentElement.style.setProperty('--screen-brightness', String(screenBrightness));
  }, [screenBrightness]);

  useEffect(() => {
    forwardProgressRef.current = forwardProgress;
  }, [forwardProgress]);

  useEffect(() => {
    if (gameStarted && !gamePaused && !gameLost && !levelComplete) {
      runStartProgressRef.current = forwardProgress;
      setSkinPlayCounts((current) => ({
        ...current,
        [selectedSkin]: current[selectedSkin] + 1,
      }));
    }
  }, [gameStarted, gamePaused, gameLost, levelComplete, selectedSkin]);

  useEffect(() => {
    if (!gameLost && !levelComplete) {
      return;
    }

    const runDistance = Math.max(0, Math.floor(forwardProgress - runStartProgressRef.current));
    if (runDistance > 0) {
      setTotalDistance((current) => current + runDistance);
    }
  }, [gameLost, levelComplete, forwardProgress]);

  useEffect(() => {
    const storedBestDistance = Math.floor(bestDistance);
    if (forwardProgress > storedBestDistance) {
      setBestDistance(Math.floor(forwardProgress));
    }
  }, [forwardProgress, bestDistance]);

  const buildObstacle = (
    choice: ObstacleType,
    levelChoice: ObstacleLevel,
    speedChoice: ObstacleSpeed,
    worldLeft: number,
    overrides?: Partial<Pick<Obstacle, 'barrierSide' | 'barrierHeight' | 'barrierWidth' | 'spawnTop' | 'spawnProgress' | 'coinValue' | 'planeEmblem' | 'planeStyle'>>,
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
    planeEmblem: choice === 'plane'
      ? PLANE_EMBLEMS[Math.floor(Math.random() * PLANE_EMBLEMS.length)]
      : undefined,
    planeStyle: choice === 'plane'
      ? PLANE_STYLES[Math.floor(Math.random() * PLANE_STYLES.length)]
      : undefined,
    ...overrides,
  });

  const spawnObstacleBatch = (baseProgress: number) => {
    const difficulty = LEVEL_CONFIG[selectedLevel];
    const startClearance = selectedLevel === 'hard' && lastSpawnLeftRef.current === 0 ? 400 : 0;
    const isInitialBatch = lastSpawnLeftRef.current === 0;
    const normalInitialAhead = Math.max(planeScreenX + planeBounds.width + 96, 360);
    const segmentCount = difficulty.count;
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
      isInitialBatch
        ? (selectedLevel === 'normal' ? normalInitialAhead : difficulty.initialAhead) + startClearance
        : getSpawnLead(baseProgress)
    );
    const startLeft = Math.max(
      minAhead,
      lastSpawnLeftRef.current + difficulty.gapMin,
    ) + (isInitialBatch ? 0 : difficulty.offscreenBuffer);

    let cursorLeft = startLeft;
    let segmentsSpawned = 0;

    while (segmentsSpawned < segmentCount) {
      if (selectedLevel === 'hard') {
        const hardLevels: ObstacleLevel[] = ['top-middle', 'middle', 'middle-bottom', 'bottom'];
        const hardChoices: ObstacleType[] = ['bird', 'trash', 'human', 'apple', 'banana', 'orange', 'grape', 'plane', 'coin'];
        const levelChoice = hardLevels[Math.floor(Math.random() * hardLevels.length)];
        const speedChoice: ObstacleSpeed = Math.random() < 0.62
          ? 'fast'
          : Math.random() < 0.82
            ? 'normal'
            : 'slow';

        if (Math.random() < 0.22) {
          const gapHeight = Math.floor(178 + Math.random() * 64);
          const minPipeHeight = 120;
          const maxTopHeight = Math.max(
            minPipeHeight,
            Math.floor(window.innerHeight - gapHeight - minPipeHeight),
          );
          const centerBias = 0.42 + Math.random() * 0.24;
          const topHeight = Math.max(
            48,
            Math.min(
              maxTopHeight - 20,
              Math.floor(window.innerHeight * centerBias) - Math.floor(gapHeight / 2),
            ),
          );
          const bottomHeight = Math.max(0, window.innerHeight - topHeight - gapHeight + 48);
          const pipeWidthBase = normalWidth + [0, 0, 12, 18][Math.floor(Math.random() * 4)];
          const pipeWidth = Math.max(88, Math.min(120, Math.floor(pipeWidthBase * (0.92 + Math.random() * 0.08))));

          next.push(
            buildObstacle('barrier', levelChoice, speedChoice, cursorLeft, {
              barrierSide: 'top',
              barrierHeight: topHeight,
              barrierWidth: pipeWidth,
            }),
            buildObstacle('barrier', levelChoice, speedChoice, cursorLeft, {
              barrierSide: 'bottom',
              barrierHeight: bottomHeight,
              barrierWidth: pipeWidth,
            }),
          );

          cursorLeft += Math.floor(normalSpacing[Math.floor(Math.random() * normalSpacing.length)] * (0.72 + Math.random() * 0.28));
        } else {
          const choice = hardChoices[Math.floor(Math.random() * hardChoices.length)];
          next.push(
            buildObstacle(choice, levelChoice, speedChoice, cursorLeft, {
              spawnTop: fruitTypes.has(choice)
                ? fruitLaneTops[levelChoice] + (Math.random() * 70 - 35)
                : undefined,
            }),
          );

          cursorLeft += Math.floor(difficulty.gapMin * (0.75 + Math.random() * 0.6));
        }

        segmentsSpawned += 1;
        continue;
      }

      if (selectedLevel === 'normal') {
        const levelChoice = levels[Math.floor(Math.random() * levels.length)];
        const speedChoice = speeds[Math.floor(Math.random() * speeds.length)];
        const gapHeight = Math.floor(216 + Math.random() * 28);
        const minPipeHeight = 120;
        const maxTopHeight = Math.max(
          minPipeHeight,
          Math.floor(window.innerHeight - gapHeight - minPipeHeight),
        );
        const topHeight = Math.max(
          40,
          Math.min(
            maxTopHeight,
            START_PLANE_POSITION.y - Math.floor((gapHeight - 48) / 2) + Math.floor(Math.random() * 81) - 40,
          ),
        );
        const bottomHeight = Math.max(0, window.innerHeight - topHeight - gapHeight + 48);
        const pipeWidthBase = normalWidth + [0, 0, 12, 18][Math.floor(Math.random() * 4)];
        const pipeWidth = Math.max(102, Math.floor(pipeWidthBase * 1.12));
        next.push(
          buildObstacle('barrier', levelChoice, speedChoice, cursorLeft, {
            barrierSide: 'top',
            barrierHeight: topHeight,
            barrierWidth: pipeWidth,
          }),
          buildObstacle('barrier', levelChoice, speedChoice, cursorLeft, {
            barrierSide: 'bottom',
            barrierHeight: bottomHeight,
            barrierWidth: pipeWidth,
          }),
        );

        cursorLeft += Math.floor(normalSpacing[Math.floor(Math.random() * normalSpacing.length)] * 0.82) + Math.floor(difficulty.gapMin * 0.5);
        segmentsSpawned += 1;
        continue;
      }

      const levelChoice = easyLevels[Math.floor(Math.random() * easyLevels.length)];
      const speedChoice = speeds[Math.floor(Math.random() * speeds.length)];
      const choice: ObstacleType = Math.random() < 0.48
        ? fruitChoices[Math.floor(Math.random() * fruitChoices.length)]
        : groundChoices[Math.floor(Math.random() * groundChoices.length)];
      next.push(buildObstacle(choice, levelChoice, speedChoice, cursorLeft));

      cursorLeft += difficulty.gapMin;
      segmentsSpawned += 1;
    }

    lastSpawnLeftRef.current = next[next.length - 1]?.worldLeft ?? startLeft;
    nextSpawnProgressRef.current = lastSpawnLeftRef.current + (
      selectedLevel === 'hard'
        ? Math.floor(difficulty.gapMin * (0.75 + Math.random() * 0.7))
        : difficulty.gapMin + Math.random() * (difficulty.gapMax - difficulty.gapMin)
    );
    setObstacles((current) => [...current, ...next]);
  };

  useEffect(() => {
    if (!gameStarted) {
      return;
    }

    if (gamePaused) {
      return;
    }

    setObstacles([]);
    lastSpawnLeftRef.current = 0;
    nextSpawnProgressRef.current = forwardProgress + LEVEL_START_AHEAD[selectedLevel];
    while (nextSpawnProgressRef.current < forwardProgress + WORLD_LOOKAHEAD) {
      spawnObstacleBatch(nextSpawnProgressRef.current);
    }

    return () => undefined;
  }, [gameStarted, selectedLevel]);

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

    if (forwardProgress < LEVEL_COMPLETE_DISTANCE) {
      return;
    }

    setGamePaused(true);
    setPlaneExploded(false);
    planeHitRef.current = false;
    setLevelComplete(true);
  }, [forwardProgress, gameStarted, gamePaused, gameLost, levelComplete]);

  useEffect(() => {
    if (!gameStarted || gamePaused || gameLost || levelComplete) {
      return;
    }

    while (forwardProgress >= nextCoinMilestoneRef.current) {
      setCoins((current) => current + 1);
      nextCoinMilestoneRef.current += COIN_REWARD_STEP;
    }
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
      if (event.key === 'g' || event.key === 'G') {
        event.preventDefault();
        setGodMode((current) => !current);
        return;
      }

      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft'
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
  }, [gameMode, gameStarted, gamePaused, godMode]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    if (planeExploded) {
      return;
    }

    const speed = isHardLevel ? 13.2 : isNormalLevel ? 5.1 : 3.6;
    const turnSpeed = isHardLevel ? 44 : isNormalLevel ? 4.8 : 3.2;
    const forwardSpeed = isHardLevel ? 11.4 : isNormalLevel ? 5.4 : 2.8;

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
  }, [planeExploded, gameStarted, gamePaused, isHardLevel, selectedLevel]);

  useEffect(() => {
    if (!gameStarted || gamePaused) {
      return;
    }

    const checkCollisions = () => {
      collisionFrameRef.current += 1;
      if (collisionFrameRef.current % 2 === 1) {
        return;
      }

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
          if (godMode) {
            return obstacle;
          }
          hitDetected = true;
          crashPointRef.current = {
            planeLeft: planeRect.left,
            planeTop: planeRect.top,
            obstacleLeft: obstacleRect.left,
            obstacleTop: obstacleRect.top,
          };

          if (isEasyLevel) {
            planeHitRef.current = true;
            setPlaneExploded(true);
            setFallingObstacleId(obstacle.id);
            window.setTimeout(() => {
              setPlaneExploded(false);
              planeHitRef.current = false;
              setGameLost(true);
            }, 150);
            return { ...obstacle, hit: true };
          }

          if (obstacle.type === 'coin') {
            setCoins((current) => current + (obstacle.coinValue ?? 1));
            return { ...obstacle, hit: true };
          }

          const isDeadlyOrange = obstacle.type === 'orange' && isHardLevel;
          const isNonLethalFruitHit =
            fruitTypes.has(obstacle.type) &&
            obstacle.type !== 'apple' &&
            !isDeadlyOrange &&
            !isEasyLevel;
          const shouldLoseImmediately = !isNonLethalFruitHit;

          if (isNonLethalFruitHit) {
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

          if (shouldLoseImmediately) {
            planeHitRef.current = true;
            setPlaneExploded(true);
            setFallingObstacleId(obstacle.id);
            window.setTimeout(() => {
              setPlaneExploded(false);
              planeHitRef.current = false;
              setGameLost(true);
            }, 150);
            return { ...obstacle, hit: true };
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
  }, [gameStarted, gamePaused, godMode]);

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
          <button type="button" className="ghost main-topbar__button" onClick={() => setShowSettings(true)}>
            Settings
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
            <button type="button" className="main-actions__secondary" onClick={() => setShowShop(true)}>
              Plane Shop
            </button>
            <button type="button" className="main-actions__secondary" onClick={() => setShowSettings(true)}>
              Settings
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
        {planeShopOverlay}
        {settingsOverlay}
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
          <p>You reached {LEVEL_COMPLETE_DISTANCE.toLocaleString()} px. Ready for the next challenge?</p>
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
    <main className={`city-page${isHardLevel ? ' city-page--hard' : ''}${gameMode === 'dash' ? ' city-page--dash' : ''}`} style={backgroundStyle}>
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
        ) : isHardLevel && gameMode === 'flight' && forwardProgress < PORTAL_APPEAR_DISTANCE ? (
          <div className="city-cave-bg" aria-hidden="true">
            <div className="city-cave-bg__wall city-cave-bg__wall--back" />
            <div className="city-cave-bg__wall city-cave-bg__wall--mid" />
            <div className="city-cave-bg__wall city-cave-bg__wall--front" />
            <div className="city-cave-bg__stalactites city-cave-bg__stalactites--top" />
            <div className="city-cave-bg__stalagmites city-cave-bg__stalactites--bottom" />
            <div className="city-cave-bg__led-strip city-cave-bg__led-strip--top" />
            <div className="city-cave-bg__led-strip city-cave-bg__led-strip--bottom" />
            <div className="city-cave-bg__mist" />
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
        {!(isHardLevel && forwardProgress < CAVE_INTRO_DISTANCE) && (
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
        )}
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
            className={`${obstacleClassNames[obstacle.type]} ${obstacleLevelClassNames[obstacle.level]} ${obstacleSpeedClassNames[obstacle.speed]}${obstacle.type === 'barrier' && obstacle.barrierSide ? ` city-obstacle--barrier--${obstacle.barrierSide}` : ''}${obstacle.type === 'orange' && obstacle.hit ? ' city-obstacle--orange-hit' : ''}${obstacle.hit && fallingObstacleId === obstacle.id ? ' city-obstacle--falling' : ''}`}
            style={
              obstacle.hit && fallingObstacleId === obstacle.id
                ? ({
                    left: `${crashPointRef.current?.obstacleLeft ?? 0}px`,
                    top: `${crashPointRef.current?.obstacleTop ?? 0}px`,
                  } as CSSProperties)
                : ({
                    left: `${obstacle.worldLeft - forwardProgress * (obstacle.travelMultiplier - 1)}px`,
                    top: obstacle.type === 'barrier'
                      ? obstacle.barrierSide === 'top'
                        ? '0px'
                        : 'auto'
                      : obstacle.type === 'spike'
                        ? obstacle.level === 'top'
                          ? '54px'
                          : undefined
                        : (fruitTypes.has(obstacle.type) || obstacle.type === 'coin') && obstacle.spawnTop !== undefined
                        ? `${obstacle.spawnTop}px`
                        : undefined,
                    bottom: obstacle.type === 'barrier'
                      ? obstacle.barrierSide === 'bottom'
                        ? '0px'
                        : 'auto'
                      : obstacle.type === 'spike' || obstacle.type === 'block' || obstacle.type === 'pad'
                        ? obstacle.level === 'bottom'
                          ? '0px'
                          : undefined
                      : undefined,
                    height: obstacle.type === 'barrier' || obstacle.type === 'spike' || obstacle.type === 'block' || obstacle.type === 'pad'
                      ? `${obstacle.barrierHeight ?? 240}px`
                      : undefined,
                    width: obstacle.type === 'barrier' || obstacle.type === 'spike' || obstacle.type === 'block' || obstacle.type === 'pad'
                      ? `${obstacle.barrierWidth ?? 96}px`
                      : undefined,
                  } as CSSProperties)
            }
          >
            {obstacle.type === 'bird' && <div className="city-obstacle__bird" />}
            {obstacle.type === 'plane' && (
              <div className={`city-obstacle__mini-plane city-obstacle__mini-plane--${obstacle.planeStyle ?? 'standard'}`}>
                <span className="city-obstacle__mini-plane-emoji" aria-hidden="true">
                  {obstacle.planeEmblem ?? '🔥'}
                </span>
              </div>
            )}
            {obstacle.type === 'trash' && <div className="city-obstacle__trash-can" />}
            {obstacle.type === 'human' && <div className="city-obstacle__human" />}
            {obstacle.type === 'apple' && <div className="city-obstacle__fruit city-obstacle__fruit--apple" />}
            {obstacle.type === 'banana' && <div className="city-obstacle__fruit city-obstacle__fruit--banana" />}
            {obstacle.type === 'orange' && <div className="city-obstacle__fruit city-obstacle__fruit--orange" />}
            {obstacle.type === 'grape' && <div className="city-obstacle__fruit city-obstacle__fruit--grape" />}
            {obstacle.type === 'barrier' && <div className="city-obstacle__barrier" />}
            {obstacle.type === 'spike' && <div className="city-obstacle__spike" />}
            {obstacle.type === 'block' && <div className="city-obstacle__block" />}
            {obstacle.type === 'pad' && <div className="city-obstacle__pad" />}
            {obstacle.type === 'coin' && <div className="city-obstacle__coin" />}
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
      <MobileControls isVisible={showMobileControls} onDirectionChange={setMovementKey} />
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
        <button type="button" className="ghost city-menu__pause" onClick={() => setShowShop(true)}>
          Shop
        </button>
        <button type="button" className="ghost city-menu__pause" onClick={() => setShowSettings(true)}>
          Settings
        </button>
      </div>
      <div className="city-debug" aria-live="polite">
        <div><strong>Progress</strong><span>{Math.floor(forwardProgress)} px</span></div>
        <div><strong>Mode</strong><span>{gameMode}</span></div>
        <div><strong>Coins</strong><span>{coinCount}</span></div>
        <div><strong>Total</strong><span>{obstacles.length}</span></div>
        <div><strong>Visible</strong><span>{visibleObstacles.length}</span></div>
        <div><strong>Next spawn</strong><span>{Math.floor(nextSpawnProgressRef.current)}</span></div>
        <div><strong>God</strong><span>{godMode ? 'ON' : 'OFF'}</span></div>
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
          className={`city-plane-modern city-plane-modern--${selectedSkin}${planeExploded ? ' city-plane-modern--exploded' : ''}`}
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
      {planeShopOverlay}
      {settingsOverlay}
    </main>
  );
}
