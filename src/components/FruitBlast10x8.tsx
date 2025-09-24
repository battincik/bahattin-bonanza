"use client";
// FruitBlast10x8.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fruit Blast 10×8 (Frontend Demo)
 * - 10×8 grid, 6 meyve
 * - 4+ bitişik → patlama, tumble
 * - %10 ihtimalle multiplier (2x–200x; kümede en yüksek x geçerli)
 * - Bahis: ₺1..₺100 (+1)
 * - SPIN büyük ve bahis kartının üstünde; spin/autospin sırasında +/– disabled
 * - Autospin: Başlat/Durdur; autospin aktifken SPIN disabled
 * - Hız: Normal (varsayılan, Turbo’ya göre 2× yavaş) / Turbo
 * - Bakiye & Son Kazanç orta kartta
 * - Patlamada ghost yok; animasyonlar transform+opacity
 */

const COLS = 10;
const ROWS = 8;
const CELL_COUNT = COLS * ROWS;

const FRUITS = [
    { key: "apple", emoji: "🍎", color: "bg-red-300", base: 0.25 },
    { key: "watermelon", emoji: "🍉", color: "bg-green-300", base: 0.3 },
    { key: "strawberry", emoji: "🍓", color: "bg-rose-300", base: 0.4 },
    { key: "cherry", emoji: "🍒", color: "bg-pink-300", base: 0.5 },
    { key: "pineapple", emoji: "🍍", color: "bg-amber-300", base: 0.6 },
    { key: "peach", emoji: "🍑", color: "bg-orange-300", base: 0.7 },
    { key: "banana", emoji: "🍌", color: "bg-yellow-300", base: 0.8 },
    { key: "grape", emoji: "🍇", color: "bg-purple-300", base: 1.0 },
    { key: "kiwi", emoji: "🥝", color: "bg-green-300", base: 1.5 },
] as const;

type Cell = {
    fruit: number;
    id: string;
    popping?: boolean;
    spawning?: boolean;
    entering?: boolean;
    mult?: number;
};

type BetHistoryEntry = {
    id: string;
    bet: number;
    result: number; // sadece kazanç miktarı (bet düşülmez)
    bursts?: BurstHistoryEntry[]; // o spin'deki patlamalar
};

type BurstHistoryEntry = {
    id: string;
    fruit: number;
    count: number;
    mult: number;
    win: number;
};

const fmt = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randint = (min: number, max: number) => Math.floor(rand(min, max + 1));
const chance = (p: number) => Math.random() < p;
const makeId = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

// LocalStorage helper fonksiyonları
const STORAGE_KEYS = {
    BET: 'fruitBlast_bet',
    BALANCE: 'fruitBlast_balance',
    BET_HISTORY: 'fruitBlast_betHistory',
    SPEED: 'fruitBlast_speed',
    LAST_WIN: 'fruitBlast_lastWin',
    AUTO_COUNT: 'fruitBlast_autoCount',
} as const;

function getFromStorage<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
}

function setToStorage<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Silently fail on storage errors
    }
}

const MULT_VALUES = [2, 4, 8, 16, 32, 64, 128, 200] as const;
const MULT_WEIGHTS = [25, 20, 15, 10, 8, 4, 2, 1];
const MULT_CUM = (() => {
    const acc: number[] = [];
    let s = 0;
    for (const w of MULT_WEIGHTS) {
        s += w;
        acc.push(s);
    }
    return acc;
})();
const rollMultiplierValue = () => {
    const r = Math.random() * 100;
    for (let i = 0; i < MULT_CUM.length; i++)
        if (r < MULT_CUM[i]) return MULT_VALUES[i];
    return 2;
};
const maybeMult = (): number | undefined =>
    chance(0.1) ? rollMultiplierValue() : undefined;

function randomCell(spawning = false, entering = false): Cell {
    return {
        fruit: randint(0, FRUITS.length - 1),
        id: makeId("cell"),
        spawning,
        entering,
        mult: maybeMult(),
    };
}
function makeRandomGrid(entering = false): Cell[] {
    return Array.from({ length: CELL_COUNT }, () =>
        randomCell(false, entering)
    );
}

function payoutForCount(base: number, count: number, bet: number): number {
    if (count >= 10) return base * 4 * bet;
    if (count >= 8) return base * 2.2 * bet;
    if (count >= 6) return base * 1.2 * bet;
    if (count >= 4) return base * 0.5 * bet;
    return 0;
}

const idxOf = (r: number, c: number) => r * COLS + c;
const rcOf = (idx: number) => ({ r: Math.floor(idx / COLS), c: idx % COLS });

function findAdjacencyPops(
    grid: Cell[]
): { fruitIndex: number; indices: number[] }[] {
    const visited = new Array(grid.length).fill(false);
    const res: { fruitIndex: number; indices: number[] }[] = [];
    for (let i = 0; i < grid.length; i++) {
        if (visited[i]) continue;
        visited[i] = true;
        const fruit = grid[i].fruit;
        const cluster = [i];
        const q: number[] = [i];
        while (q.length) {
            const cur = q.shift()!;
            const { r, c } = rcOf(cur);
            const neighbors = [
                r > 0 ? idxOf(r - 1, c) : -1,
                r < ROWS - 1 ? idxOf(r + 1, c) : -1,
                c > 0 ? idxOf(r, c - 1) : -1,
                c < COLS - 1 ? idxOf(r, c + 1) : -1,
            ].filter((x) => x >= 0) as number[];
            for (const n of neighbors) {
                if (!visited[n] && grid[n].fruit === fruit) {
                    visited[n] = true;
                    cluster.push(n);
                    q.push(n);
                }
            }
        }
        if (cluster.length >= 4)
            res.push({ fruitIndex: fruit, indices: cluster });
    }
    return res;
}

function collapse(grid: (Cell | null)[]): (Cell | null)[] {
    for (let c = 0; c < COLS; c++) {
        const col: (Cell | null)[] = [];
        for (let r = ROWS - 1; r >= 0; r--) {
            const idx = idxOf(r, c);
            if (grid[idx]) col.push(grid[idx]!);
        }
        while (col.length < ROWS) col.push(null);
        for (let r = ROWS - 1; r >= 0; r--)
            grid[idxOf(r, c)] = col[ROWS - 1 - r];
    }
    return grid;
}
function fillEmpties(grid: (Cell | null)[]): Cell[] {
    return grid.map((cell) =>
        cell
            ? { ...cell, spawning: false, entering: false }
            : randomCell(true, false)
    ) as Cell[];
}

export default function FruitBlast10x8() {
    const [grid, setGrid] = useState<Cell[]>([]);
    const [bet, setBet] = useState<number>(1);
    const [isSpinning, setIsSpinning] = useState(false);
    const [lastWin, setLastWin] = useState<number>(0);
    const [tumbleCount, setTumbleCount] = useState<number>(0);
    
    // geçmiş kayıtları
    const [betHistory, setBetHistory] = useState<BetHistoryEntry[]>([]);
    const [burstHistory, setBurstHistory] = useState<BurstHistoryEntry[]>([]);
    const [expandedBetId, setExpandedBetId] = useState<string | null>(null);

    // bakiye
    const [balance, setBalance] = useState<number>(100);

    // hız
    type Speed = "normal" | "turbo";
    const [speed, setSpeed] = useState<Speed>("normal");
    const speedMul = speed === "normal" ? 2 : 1; // tüm bekleme/animasyonlar *2

    // autospin
    const [autoCount, setAutoCount] = useState<number>(0);
    const [autoTotal, setAutoTotal] = useState<number>(0);
    const autoSelRef = useRef<HTMLSelectElement | null>(null);

    // loading state
    const [isLoading, setIsLoading] = useState(true);
    
    // localStorage'dan değerleri yükle (hydration sonrası)
    useEffect(() => {
        setGrid(makeRandomGrid());
        setBet(getFromStorage(STORAGE_KEYS.BET, 1));
        setLastWin(getFromStorage(STORAGE_KEYS.LAST_WIN, 0));
        setBetHistory(getFromStorage(STORAGE_KEYS.BET_HISTORY, []));
        setBalance(getFromStorage(STORAGE_KEYS.BALANCE, 100));
        setSpeed(getFromStorage(STORAGE_KEYS.SPEED, "normal"));
        setAutoCount(getFromStorage(STORAGE_KEYS.AUTO_COUNT, 0));
        setIsLoading(false);
    }, []);

    const spinOnce = useCallback(async (): Promise<number> => {
        if (balance < bet) return 0; // yetersiz bakiye → başlamasın
        setBalance((b) => {
            const newBalance = b - bet;
            setToStorage(STORAGE_KEYS.BALANCE, newBalance);
            return newBalance;
        }); // bahsi düş

        setIsSpinning(true);
        setLastWin(0);
        setTumbleCount(0);
        
        // Spin başlangıcında son patlamaları sıfırla
        setBurstHistory([]);
        const currentSpinBursts: BurstHistoryEntry[] = []; // Bu spin'e özel burst listesi

        // ilk düşüş (tüm board)
        let cur: Cell[] = makeRandomGrid(true);
        setGrid(cur);
        await sleep(1000 * speedMul);
        cur = cur.map((c) => ({ ...c, entering: false }));
        setGrid(cur);

        let totalWin = 0;
        let safety = 60;
        while (safety-- > 0) {
            const pops = findAdjacencyPops(cur);
            if (pops.length === 0) break;

            // ödeme (kümedeki en yüksek multiplier)
            let tumbleWin = 0;
            for (const p of pops) {
                const base = FRUITS[p.fruitIndex].base;
                const count = p.indices.length;
                let pay = payoutForCount(base, count, bet);
                const maxMult = p.indices.reduce(
                    (mx, idx) => Math.max(mx, cur[idx].mult ?? 1),
                    1
                );
                pay *= maxMult;
                tumbleWin += pay;

                // Real-time olarak patlama geçmişini güncelle
                const burstEntry: BurstHistoryEntry = {
                    id: makeId("burst"),
                    fruit: p.fruitIndex,
                    count,
                    mult: maxMult,
                    win: pay,
                };
                currentSpinBursts.push(burstEntry); // Bu spin'in patlamalarına ekle
                setBurstHistory(prev => [burstEntry, ...prev].slice(0, 50));
            }

            // patlat → anında boş
            const marked = new Set<number>(pops.flatMap((p) => p.indices));
            cur = cur.map((cell, idx) =>
                marked.has(idx) ? { ...cell, popping: true } : cell
            );
            setGrid([...cur]);
            await sleep(360 * speedMul);

            // çökert & doldur (sadece yeniler düşer)
            let next: (Cell | null)[] = cur.map((cell, idx) =>
                marked.has(idx) ? null : { ...cell, popping: false }
            );
            next = collapse(next);
            cur = fillEmpties(next);
            setGrid(cur);
            await sleep(520 * speedMul);

            totalWin += tumbleWin;
            setLastWin(totalWin);
            setTumbleCount((t) => t + 1);
        }

        // Geçmişleri güncelle
        const betEntry: BetHistoryEntry = {
            id: makeId("bet"),
            bet,
            result: totalWin, // sadece kazanç (bet çıkarılmamış)
            bursts: currentSpinBursts, // Bu spin'in patlamalarını kullan
        };

        setBetHistory(prev => {
            const newHistory = [...prev, betEntry];
            setToStorage(STORAGE_KEYS.BET_HISTORY, newHistory);
            return newHistory;
        });

        if (totalWin > 0) {
            setBalance((b) => {
                const newBalance = b + totalWin;
                setToStorage(STORAGE_KEYS.BALANCE, newBalance);
                return newBalance;
            });
        }
        
        // Son kazancı localStorage'a kaydet
        setToStorage(STORAGE_KEYS.LAST_WIN, totalWin);
        
        setIsSpinning(false);
        return totalWin;
    }, [bet, balance, speedMul]);

    const handleSpin = useCallback(async () => {
        if (isSpinning || autoCount > 0) return; // autospin varken spin yok
        await spinOnce();
    }, [isSpinning, autoCount, spinOnce]);

    useEffect(() => {
        if (autoCount > 0 && !isSpinning) {
            (async () => {
                const w = await spinOnce();
                setAutoTotal((t) => t + w);
                setAutoCount((c) => c - 1);
            })();
        }
    }, [autoCount, isSpinning, spinOnce]);

    // Bahis fonksiyonları
    const minBet = useCallback(() => {
        setBet(1);
        setToStorage(STORAGE_KEYS.BET, 1);
    }, []);
    const maxBet = useCallback(() => {
        setBet(1000);
        setToStorage(STORAGE_KEYS.BET, 1000);
    }, []);
    const incBet1 = useCallback(() => {
        const newBet = Math.min(1000, bet + 1);
        setBet(newBet);
        setToStorage(STORAGE_KEYS.BET, newBet);
    }, [bet]);
    const incBet10 = useCallback(() => {
        const newBet = Math.min(1000, bet + 10);
        setBet(newBet);
        setToStorage(STORAGE_KEYS.BET, newBet);
    }, [bet]);
    const incBet100 = useCallback(() => {
        const newBet = Math.min(1000, bet + 100);
        setBet(newBet);
        setToStorage(STORAGE_KEYS.BET, newBet);
    }, [bet]);
    const decBet1 = useCallback(() => {
        const newBet = Math.max(1, bet - 1);
        setBet(newBet);
        setToStorage(STORAGE_KEYS.BET, newBet);
    }, [bet]);
    const decBet10 = useCallback(() => {
        const newBet = Math.max(1, bet - 10);
        setBet(newBet);
        setToStorage(STORAGE_KEYS.BET, newBet);
    }, [bet]);
    const decBet100 = useCallback(() => {
        const newBet = Math.max(1, bet - 100);
        setBet(newBet);
        setToStorage(STORAGE_KEYS.BET, newBet);
    }, [bet]);

    // mini testler (console)
    const testedRef = useRef(false);
    useEffect(() => {
        if (testedRef.current) return;
        testedRef.current = true;
        runDevTests();
    }, []);

    // Loading ekranı
    if (isLoading) {
        return (
            <div className="h-screen w-full bg-slate-900 text-slate-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
                    <h2 className="text-xl font-semibold text-slate-300">Bahattin Bonanza Yükleniyor...</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-slate-900 text-slate-100 flex flex-col overflow-hidden">
            <style>{keyframesCSS}</style>

            <div className="max-w-[90vw] w-full mx-auto flex flex-col flex-1 py-2 px-4 overflow-hidden">
                {/* başlık */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                        Bahattin Bonanza: Fruit Blast 
                    </h1>
                    <div className="text-sm text-slate-300">
                        Eğitim amaçlıdır :D
                    </div>
                </div>

                {/* Flex layout: oyun alanı üstte, kontroller altta */}
                <div className="flex flex-col justify-between flex-1 min-h-0">
                    {/* Ana oyun alanı: Sol panel | Grid | Sağ panel */}
                    <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_240px] lg:grid-cols-[220px_1fr_220px] gap-2 lg:gap-3 flex-1 min-h-0">
                    {/* Sol Panel - Bahis Geçmişi */}
                    <div className="bg-slate-800/70 rounded-2xl p-4 h-fit">
                        <h3 className="text-sm font-semibold mb-3 text-slate-300">Bahis Geçmişi</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-hide">
                            {betHistory.slice(-2500).reverse().map((entry, idx) => (
                                <div
                                    key={`bet-${entry.id}-${idx}`}
                                    className={`rounded-lg border transition-all duration-300 ${
                                        entry.bursts && entry.bursts.length > 0 ? "cursor-pointer" : ""
                                    } ${
                                        entry.result > 0
                                            ? "bg-emerald-900/20 border-emerald-500/30 text-emerald-300"
                                            : "bg-slate-800/40 border-slate-600/30 text-slate-300"
                                    } ${
                                        idx === 0 ? "animate-pulse" : ""
                                    }`}
                                    style={{
                                        animation: idx === 0 ? "slideInTop 0.5s ease-out" : undefined
                                    }}
                                    onClick={() => {
                                        if (entry.bursts && entry.bursts.length > 0) {
                                            setExpandedBetId(expandedBetId === entry.id ? null : entry.id)
                                        }
                                    }}
                                >
                                    {/* Ana spin bilgisi */}
                                    <div className="p-2">
                                        <div className="flex justify-between items-center">
                                            <div className="text-xs text-slate-400">
                                                ₺{fmt.format(entry.bet)}
                                            </div>
                                            <div className={`text-sm font-semibold ${
                                                entry.result > 0 ? "text-emerald-300" : "text-slate-400"
                                            }`}>
                                                ₺{fmt.format(entry.result)}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Collapse kısmı - patlamalar */}
                                    {expandedBetId === entry.id && entry.bursts && entry.bursts.length > 0 && (
                                        <div className="border-t border-slate-600/50 p-2 space-y-1">
                                            {entry.bursts.map((burst, burstIdx) => (
                                                <div 
                                                    key={`burst-${burst.id}-${burstIdx}`}
                                                    className="flex items-center gap-2 p-1 rounded bg-slate-700/30"
                                                >
                                                    {/* Mini meyve ikonu */}
                                                    <div className="text-sm">
                                                        {FRUITS[burst.fruit].emoji}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs text-slate-400">
                                                            {burst.count} adet
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-semibold text-emerald-300">
                                                        ₺{fmt.format(burst.win)}
                                                    </div>
                                                    {burst.mult > 1 && (
                                                        <div className="text-xs bg-white/20 px-1 rounded">
                                                            x{burst.mult}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {betHistory.length === 0 && (
                                <div className="text-center text-slate-500 py-8">
                                    Henüz bahis yok
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Orta - Oyun Grid'i */}
                    <div className="relative flex justify-center flex-1 pb-4">
                        <div className="grid grid-cols-10 gap-3 sm:gap-4 lg:gap-5 xl:gap-6 p-4 sm:p-6 lg:p-8 xl:p-10 bg-slate-900/50 rounded-xl sm:rounded-2xl border border-slate-700/30">
                            {grid.length > 0 && grid.map((cell, idx) => (
                                <div key={cell.id + ":wrap"} className="w-full">
                                    <CellView
                                        cell={cell}
                                        idx={idx}
                                        speedMul={speedMul}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Sağ Panel - Patlayan Meyveler */}
                    <div className="bg-slate-800/70 rounded-2xl p-4 h-fit">
                        <h3 className="text-sm font-semibold mb-3 text-slate-300">Bu Spindeki Patlamalar</h3>
                        <div className="space-y-2 max-h-96 overflow-y-hidden">
                            {burstHistory.map((burst, idx) => (
                                <div
                                    key={`burst-${burst.id}-${idx}`}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50 transition-all duration-500"
                                    style={{
                                        animation: `slideInDown 0.5s ease-out ${idx * 0.1}s both`
                                    }}
                                >
                                    {/* Mini Cell */}
                                    <div className="relative flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden">
                                        <div className={`absolute inset-0 rounded-lg ${FRUITS[burst.fruit].color} opacity-80`} />
                                        <div className="relative z-10 text-lg">
                                            {FRUITS[burst.fruit].emoji}
                                        </div>
                                        {burst.mult > 1 && (
                                            <div className="absolute -top-1 -right-1 z-20">
                                                <div className="px-1 py-0.5 rounded text-xs font-bold bg-white text-slate-900 scale-75">
                                                    x{burst.mult}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Bilgiler */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs text-slate-400">
                                            {burst.count} tane
                                        </div>
                                        <div className="text-sm font-semibold text-emerald-300">
                                            ₺{fmt.format(burst.win)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {burstHistory.length === 0 && (
                                <div className="text-center text-slate-500 py-8">
                                    Henüz patlama yok
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                    
                    {/* Kontroller altta sabit */}
                    <div className="mt-auto pt-2">
                        {/* Autospin üst panel (kartların ÜSTÜNDE) */}
                        {autoCount > 0 && (
                            <div className="bg-slate-800/60 rounded-lg p-2 text-center mb-2">
                                <div className="text-xs text-slate-300">
                                    Kalan: {autoCount} • Toplam Kazanç:{" "}
                                    <span className="text-emerald-300 font-semibold">
                                        ₺{fmt.format(autoTotal)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* 3 kart: Bahis | Bakiye+Son Kazanç | Autospin+Hız+SPIN */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                            {/* Bahis Kartı */}
                            <div className="bg-slate-800/70 rounded-lg p-2 flex flex-col">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-semibold text-slate-300">Bahis</div>
                                    <div className="text-base font-bold">₺{fmt.format(bet)}</div>
                                </div>
                                
                                {/* Bahis butonları */}
                                <div className="grid grid-cols-2 gap-1 mb-2">
                                    <button
                                        onClick={minBet}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        MIN
                                    </button>
                                    <button
                                        onClick={maxBet}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        MAX
                                    </button>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-1 mb-2">
                                    <button
                                        onClick={incBet1}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        +1
                                    </button>
                                    <button
                                        onClick={incBet10}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        +10
                                    </button>
                                    <button
                                        onClick={incBet100}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        +100
                                    </button>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-1">
                                    <button
                                        onClick={decBet1}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        -1
                                    </button>
                                    <button
                                        onClick={decBet10}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        -10
                                    </button>
                                    <button
                                        onClick={decBet100}
                                        disabled={isSpinning || autoCount > 0}
                                        className={`px-2 py-1 rounded text-xs ${
                                            isSpinning || autoCount > 0
                                                ? "bg-slate-800 text-slate-500"
                                                : "bg-slate-700 hover:bg-slate-600"
                                        }`}
                                    >
                                        -100
                                    </button>
                                </div>
                            </div>

                            {/* Bakiye + Son Kazanç Kartı */}
                            <div className="bg-slate-800/70 rounded-lg p-2 flex flex-col justify-center">
                                <div className="text-xs font-semibold text-slate-300 mb-1">Bakiye</div>
                                <div className="text-base font-bold mb-2">₺{fmt.format(balance)}</div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <div className="text-xs text-slate-400 mb-1">Son Kazanç</div>
                                        <div className={`text-sm font-semibold ${
                                            lastWin > 0 ? "text-emerald-300" : "text-slate-200"
                                        }`}>
                                            ₺{fmt.format(lastWin)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400 mb-1">Tumble</div>
                                        <div className="text-sm font-semibold text-slate-200">
                                            {tumbleCount}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Autospin + Hız + SPIN Kartı */}
                            <div className="bg-slate-800/70 rounded-lg p-2 flex flex-col">
                                {/* Hız kontrolü */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-semibold text-slate-300">Hız</div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => {
                                                setSpeed("normal");
                                                setToStorage(STORAGE_KEYS.SPEED, "normal");
                                            }}
                                            disabled={isSpinning || autoCount > 0}
                                            className={`px-2 py-1 rounded text-xs ${
                                                speed === "normal"
                                                    ? "bg-sky-600 text-white"
                                                    : "bg-slate-700 hover:bg-slate-600"
                                            }`}
                                        >
                                            Normal
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSpeed("turbo");
                                                setToStorage(STORAGE_KEYS.SPEED, "turbo");
                                            }}
                                            disabled={isSpinning || autoCount > 0}
                                            className={`px-2 py-1 rounded text-xs ${
                                                speed === "turbo"
                                                    ? "bg-sky-600 text-white"
                                                    : "bg-slate-700 hover:bg-slate-600"
                                            }`}
                                        >
                                            Turbo
                                        </button>
                                    </div>
                                </div>

                                {/* Autospin kontrolü */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm font-semibold text-slate-300">Autospin</div>
                                    <div className="flex gap-1">
                                        <select
                                            ref={autoSelRef}
                                            className="bg-slate-700 rounded px-2 py-1 text-xs"
                                            disabled={isSpinning || autoCount > 0}
                                            defaultValue="10"
                                        >
                                            {[10, 25, 50, 100].map((n) => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                        {autoCount === 0 ? (
                                            <button
                                                onClick={() => {
                                                    if (isSpinning) return;
                                                    const n = parseInt(autoSelRef.current?.value || "10", 10);
                                                    setAutoTotal(0);
                                                    setAutoCount(n);
                                                }}
                                                className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-xs"
                                            >
                                                Start
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setAutoCount(0)}
                                                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs"
                                            >
                                                Stop
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                {/* SPIN butonu */}
                                <button
                                    onClick={handleSpin}
                                    disabled={isSpinning || autoCount > 0}
                                    className={`py-2 rounded-lg font-bold text-sm transition transform active:scale-95 ${
                                        isSpinning || autoCount > 0
                                            ? "bg-slate-700 text-slate-400"
                                            : "bg-emerald-500 hover:bg-emerald-400 text-white"
                                    }`}
                                >
                                    {isSpinning ? "Dönüyor..." : "SPIN"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* animasyon stylesheet */}
                <style>{keyframesCSS}</style>
            </div>
        </div>
    );
}

function CellView({
    cell,
    idx,
    speedMul,
}: {
    cell: Cell;
    idx: number;
    speedMul: number;
}) {
    const f = FRUITS[cell.fruit];
    const { r, c } = rcOf(idx);
    const enteringDelay = `${c * 50 + r * 12}ms`;
    const spawningDelay = `${c * 35 + (ROWS - r) * 10}ms`;

    const isEntering = !!cell.entering;
    const isSpawning = !!cell.spawning;
    const isPopping = !!cell.popping;

    // hız uyarlaması
    const fallMs = isEntering ? 700 * speedMul : 520 * speedMul;
    const hasAnimation = !isPopping;
    const baseDelay = isEntering
        ? enteringDelay
        : isSpawning
        ? spawningDelay
        : "0ms";
    const initialTransform: string | undefined =
        (isEntering || isSpawning) && !isPopping
            ? "translateY(-120%)"
            : undefined;
    const initialOpacity: number | undefined =
        (isEntering || isSpawning) && !isPopping ? 0 : undefined;

    const popMs = 360 * speedMul;
    const sparkMs = 420 * speedMul;

    return (
        <div
            className="relative flex items-center justify-center aspect-square rounded-xl border border-black/5 shadow-sm will-change-transform"
            style={{
                userSelect: "none",
                ...(hasAnimation && {
                    animationName: "fallIn",
                    animationDuration: `${fallMs}ms`,
                    animationTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)",
                    animationFillMode: "forwards",
                    animationDelay: baseDelay,
                }),
                transform: initialTransform,
                opacity: initialOpacity,
            }}
        >
            {/* zemin: patlamada tamamen boş */}
            <div
                className={`absolute inset-0 rounded-xl ${
                    isPopping ? "bg-slate-900" : f.color + " opacity-80"
                }`}
            />

            {/* patlama fx */}
            {isPopping && (
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-0 grid place-items-center">
                        <div
                            className="pop-burst"
                            style={{ animationDuration: `${popMs}ms` }}
                        />
                    </div>
                    <div className="absolute inset-0">
                        {["s1", "s2", "s3", "s4", "s5", "s6"].map((s) => (
                            <span
                                key={s}
                                className={`pop-spark ${s}`}
                                style={{ animationDuration: `${sparkMs}ms` }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* multiplier rozet */}
            {!isPopping && cell.mult && (
                <div className="absolute -right-2 -top-2 sm:-right-3 sm:-top-3 z-50 select-none">
                    <div className="px-1 py-0.5 sm:px-1.5 sm:py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-black shadow-lg ring-1 ring-slate-300 border border-slate-200 transform rotate-12 scale-75">
                        x{cell.mult}
                    </div>
                </div>
            )}

            {/* emoji */}
            {!isPopping && (
                <div className="relative z-10 text-2xl sm:text-3xl">
                    {f.emoji}
                </div>
            )}
        </div>
    );
}

// utils
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// dev testleri (console)
function runDevTests() {
    try {
        console.assert(
            payoutForCount(1, 3, 1) === 0,
            "3'lü kümede ödeme olmamalı"
        );
        console.assert(payoutForCount(1, 4, 1) > 0, "4'lü kümede ödeme olmalı");
        console.assert(
            payoutForCount(1, 10, 1) >= payoutForCount(1, 8, 1),
            "10+ ≥ 8+"
        );

        const ok = new Set([2, 4, 8, 16, 32, 64, 128, 200]);
        for (let i = 0; i < 50; i++)
            console.assert(
                ok.has(rollMultiplierValue()),
                "desteklenmeyen multiplier"
            );

        const base = makeRandomGrid(false);
        const f = 5;
        base[idxOf(0, 0)].fruit = f;
        base[idxOf(0, 1)].fruit = f;
        base[idxOf(0, 2)].fruit = f;
        base[idxOf(0, 3)].fruit = f;
        const found = findAdjacencyPops(base);
        const pass = found.some(
            (cl) =>
                cl.fruitIndex === f &&
                [idxOf(0, 0), idxOf(0, 1), idxOf(0, 2), idxOf(0, 3)].every(
                    (i) => cl.indices.includes(i)
                )
        );
        console.assert(pass, "4'lük test kümesi bulunamadı");
    } catch (e) {
        console.error("Dev testleri:", e);
    }
}

// animasyon stylesheet (keyframes)
const keyframesCSS = `
@keyframes fallIn {
  0% { transform: translateY(-120%); opacity: 0.01; }
  60% { transform: translateY(5%); opacity: 0.98; }
  80% { transform: translateY(-2%); opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes slideInTop {
  0% { transform: translateY(-100%); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes slideInDown {
  0% { transform: translateY(-50px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
.pop-burst {
  width: 68%;
  height: 68%;
  border-radius: 9999px;
  background: radial-gradient(closest-side, rgba(255,255,255,0.9), rgba(255,255,255,0.35), rgba(255,255,255,0));
  mix-blend-mode: screen;
  animation: burst 360ms ease-out forwards;
  will-change: transform, opacity, filter;
  filter: blur(0.4px);
}
@keyframes burst {
  0% { transform: scale(0.6); opacity: 0.9; }
  70% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(1.35); opacity: 0; }
}
.pop-spark {
  position: absolute;
  left: 50%; top: 50%;
  width: 8px; height: 8px;
  margin-left: -4px; margin-top: -4px;
  border-radius: 9999px;
  background: white;
  box-shadow: 0 0 10px rgba(255,255,255,0.8);
  animation: spark 420ms ease-out forwards;
  will-change: transform, opacity;
}
@keyframes spark {
  0% { transform: translate(0,0) scale(1); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0.35); opacity: 0; }
}
.pop-spark.s1 { --dx: -26px; --dy: -6px; }
.pop-spark.s2 { --dx:  28px; --dy:  4px; }
.pop-spark.s3 { --dx: -10px; --dy: 26px; }
.pop-spark.s4 { --dx:  12px; --dy: -24px; }
.pop-spark.s5 { --dx: -22px; --dy: 14px; }
.pop-spark.s6 { --dx:  20px; --dy: -16px; }

/* Scrollbar gizleme */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
`;
