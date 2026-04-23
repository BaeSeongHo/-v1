import React, { useEffect, useRef, useState } from 'react';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PADDLE_WIDTH = 140;
const PADDLE_HEIGHT = 12;
const BALL_RADIUS = 7;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_PADDING = 3;
const BRICK_HEIGHT = 32;
const BRICK_WIDTH = CANVAS_WIDTH / BRICK_COLS;

const COLORS = [
  '#FF595E', // Red (Target)
  '#FFCA3A', // Yellow
  '#8AC926', // Green
  '#1982C4', // Blue
  '#6A4C93', // Purple
  '#4267B2'  // Dark Blue
];

interface Brick {
  x: number;
  y: number;
  status: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size?: number;
  gravity?: number;
}

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'HOME' | 'PLAYING' | 'GAMEOVER' | 'WIN' | 'PAUSED'>('HOME');
  const [playerName, setPlayerName] = useState('AGENT_01');
  const [displayName, setDisplayName] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [redBricksBroken, setRedBricksBroken] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalTime, setFinalTime] = useState('');
  const [rankings, setRankings] = useState<{name: string, time: number}[]>([]);
  
  const paddleX = useRef((CANVAS_WIDTH - PADDLE_WIDTH) / 2);
  const ball = useRef({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 100,
    dx: 6,
    dy: -6,
    speed: 8
  });
  const bricks = useRef<Brick[]>([]);
  const particles = useRef<Particle[]>([]);
  const rightPressed = useRef(false);
  const leftPressed = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const bgMusic = useRef<HTMLAudioElement | null>(null);
  const isWinningRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('inuRankings');
    if (saved) setRankings(JSON.parse(saved));
    
    // Init BGM
    bgMusic.current = new Audio('/Hyper_Speed_Run.mp3');
    bgMusic.current.loop = true;
    bgMusic.current.volume = 0.15;
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      bgMusic.current?.play().catch(() => {});
    } else if (gameState === 'PAUSED') {
      bgMusic.current?.pause();
    } else {
      bgMusic.current?.pause();
      if (bgMusic.current) bgMusic.current.currentTime = 0;
    }
  }, [gameState]);

  const saveRanking = async (time: number) => {
    // 1. 기존 로컬 랭킹 저장
    const newRankings = [...rankings, { name: displayName, time }]
      .sort((a, b) => a.time - b.time)
      .slice(0, 3);
    setRankings(newRankings);
    localStorage.setItem('inuRankings', JSON.stringify(newRankings));

    // 2. 구글 시트로 데이터 전송 (.env.local 참조)
    const scriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL;
    if (scriptUrl) {
      try {
        await fetch(scriptUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: displayName,
            finishtime: formatTime(time)
          }),
        });
        console.log("Data sent to Google Sheet successfully");
      } catch (error) {
        console.error("Error sending data:", error);
      }
    }
  };

  // Synth sound effect helper
  const playHitSound = () => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContext.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const initBricks = () => {
    const newBricks: Brick[] = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const brickX = c * BRICK_WIDTH;
        const brickY = r * BRICK_HEIGHT;
        const color = Math.random() < 0.3 ? COLORS[0] : COLORS[1 + Math.floor(Math.random() * 5)];
        newBricks.push({ x: brickX, y: brickY, status: 1, color });
      }
    }
    bricks.current = newBricks;
  };

  const createParticles = (x: number, y: number, color: string, count = 15, speed = 10, size = 5, gravity = 0) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        life: 1.0,
        color,
        size,
        gravity
      });
    }
  };

  const createFireworks = () => {
    // Intense full-screen fireworks celebration
    for (let i = 0; i < 24; i++) {
      setTimeout(() => {
        const x = 50 + Math.random() * (CANVAS_WIDTH - 100);
        const y = 80 + Math.random() * (CANVAS_HEIGHT - 200);
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        createParticles(x, y, color, 80, 14, 7, 0.08); // More particles, higher gravity
      }, i * 250);
    }
  };

  useEffect(() => {
    let interval: number;
    if (gameState === 'PLAYING' && countdown === 0) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState, countdown]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd') rightPressed.current = true;
      if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a') leftPressed.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd') rightPressed.current = false;
      if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a') leftPressed.current = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current || gameState !== 'PLAYING') return;
      const rect = canvasRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      if (relativeX > 0 && relativeX < CANVAS_WIDTH) {
        paddleX.current = Math.max(0, Math.min(CANVAS_WIDTH - PADDLE_WIDTH, relativeX - PADDLE_WIDTH / 2));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [gameState]);

  const startGame = () => {
    setDisplayName(playerName || 'GUEST');
    setLives(3);
    setRedBricksBroken(0);
    setElapsedTime(0);
    setFinalTime('');
    setGameState('PLAYING');
    setCountdown(3);
    isWinningRef.current = false;
    particles.current = []; // Clear old particles
    initBricks();
    resetBall();
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const resetBall = () => {
    ball.current = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 120,
      speed: 8,
      dx: 6 * (Math.random() > 0.5 ? 1 : -1),
      dy: -6,
    };
    paddleX.current = (CANVAS_WIDTH - PADDLE_WIDTH) / 2;
  };

  useEffect(() => {
    if (gameState !== 'PLAYING' && gameState !== 'WIN') return;

    let animationFrameId: number;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });

    const draw = () => {
      if (!ctx || !canvas) return;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Bricks
      bricks.current.forEach((b) => {
        if (b.status === 1) {
          ctx.beginPath();
          ctx.roundRect(b.x + BRICK_PADDING, b.y + BRICK_PADDING, BRICK_WIDTH - BRICK_PADDING * 2, BRICK_HEIGHT - BRICK_PADDING * 2, 6);
          ctx.fillStyle = b.color;
          ctx.fill();
        }
      });

      // Paddle
      ctx.beginPath();
      ctx.roundRect(paddleX.current, CANVAS_HEIGHT - PADDLE_HEIGHT - 40, PADDLE_WIDTH, PADDLE_HEIGHT, 10);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Ball
      if (gameState === 'PLAYING') {
        ctx.beginPath();
        ctx.arc(ball.current.x, ball.current.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }

      // Countdown
      if (countdown > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 160px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countdown.toString(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }

      // Particles
      particles.current.forEach((p, index) => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.012; // Slower fade for fireworks
        if (p.gravity) p.vy += p.gravity;
        if (p.life <= 0) particles.current.splice(index, 1);
        else {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.life * (p.size || 5), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });

      // Logic
      if (countdown === 0 && gameState === 'PLAYING') {
        if (rightPressed.current && paddleX.current < CANVAS_WIDTH - PADDLE_WIDTH) paddleX.current += 12;
        if (leftPressed.current && paddleX.current > 0) paddleX.current -= 12;

        if (ball.current.x + ball.current.dx > CANVAS_WIDTH - BALL_RADIUS || ball.current.x + ball.current.dx < BALL_RADIUS) ball.current.dx = -ball.current.dx;
        if (ball.current.y + ball.current.dy < BALL_RADIUS) ball.current.dy = -ball.current.dy;
        else if (ball.current.y + ball.current.dy > CANVAS_HEIGHT - BALL_RADIUS - 40 - PADDLE_HEIGHT) {
          if (ball.current.x > paddleX.current && ball.current.x < paddleX.current + PADDLE_WIDTH) {
            const hit = (ball.current.x - (paddleX.current + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
            ball.current.dx = ball.current.speed * Math.sin(hit * Math.PI/2.5);
            ball.current.dy = -ball.current.speed * Math.cos(hit * Math.PI/2.5);
          } else if (ball.current.y + ball.current.dy > CANVAS_HEIGHT - BALL_RADIUS) {
            setLives(prev => {
              const nl = prev - 1;
              if (nl <= 0) { 
                setGameState('GAMEOVER'); 
                return 0; 
              } else { 
                resetBall(); 
                setCountdown(0); // No countdown on respawn as requested
                return nl; 
              }
            });
            return;
          }
        }

        bricks.current.forEach(b => {
          if (b.status === 1 && ball.current.x + BALL_RADIUS > b.x && ball.current.x - BALL_RADIUS < b.x + BRICK_WIDTH && ball.current.y + BALL_RADIUS > b.y && ball.current.y - BALL_RADIUS < b.y + BRICK_HEIGHT) {
            ball.current.dy = -ball.current.dy;
            b.status = 0;
            playHitSound();
            createParticles(ball.current.x, ball.current.y, b.color);
            if (b.color === COLORS[0]) {
              setRedBricksBroken(r => {
                const nr = r + 1;
                if (nr === 3 && !isWinningRef.current) {
                  isWinningRef.current = true;
                  setFinalTime(formatTime(elapsedTime));
                  setGameState('WIN');
                  createFireworks();
                  saveRanking(elapsedTime);
                }
                return nr;
              });
            }
          }
        });

        ball.current.x += ball.current.dx;
        ball.current.y += ball.current.dy;
      }

      // Keep fireworks going on success screen
      if (gameState === 'WIN' && Math.random() < 0.05) {
        const x = Math.random() * CANVAS_WIDTH;
        const y = Math.random() * (CANVAS_HEIGHT - 200);
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        createParticles(x, y, color, 40, 10, 5, 0.05);
      }

      animationFrameId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, countdown, lives, elapsedTime]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      width: '100vw',
      minHeight: '100vh',
      padding: '2rem',
      boxSizing: 'border-box'
    }}>
      {gameState === 'HOME' ? (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div className="cyber-panel" style={{ width: '100%', maxWidth: '480px', padding: '4rem 3rem' }}>
          <div style={{
            width: '220px',
            height: '220px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '3rem',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 30px 60px -12px rgba(0,0,0,0.5)'
          }}>
            <img src="/publicmascot.png" alt="Mascot" style={{ width: '110%', height: '110%', objectFit: 'contain' }} />
          </div>
            
            <h1 style={{ fontSize: '3.5rem', fontWeight: 900, marginBottom: '1rem', color: '#fff', letterSpacing: '-0.05em', lineHeight: 1 }}>
              INU<br />BREAKOUT
            </h1>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.3, letterSpacing: '0.6em', textTransform: 'uppercase', marginBottom: '4rem' }}>
              Strategic recovery
            </p>
            
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
              <input
                type="text"
                className="neo-input"
                placeholder="ID_CORE"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && startGame()}
                style={{
                  fontSize: '2rem',
                  padding: '1.25rem 1.5rem',
                  borderRadius: '60px',
                  width: '100%',
                  fontWeight: 900,
                  letterSpacing: '-0.02em'
                }}
              />
              <button onClick={startGame} className="neo-button" style={{ 
                fontSize: '1.25rem', 
                padding: '1.25rem 1.5rem', 
                borderRadius: '60px', 
                width: '100%',
                fontWeight: 900 
              }}>시작</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* HUD Scoreboard */}
          <div className="glass-morphism" style={{ 
            width: '100%', 
            maxWidth: '800px', 
            padding: '2rem 4rem', 
            marginBottom: '3rem', 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: '40px',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: 900, opacity: 0.2, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '8px' }}>Operator</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>{displayName}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: 900, opacity: 0.2, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '8px' }}>Mission</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#FF595E' }}>RECOVERY: {redBricksBroken}/3</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', marginTop: '4px', tabularNums: true }}>{formatTime(elapsedTime)}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, position: 'relative' }}>
              <button 
                onClick={() => setGameState('PAUSED')}
                style={{
                  position: 'absolute',
                  top: '-30px',
                  right: '-10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  color: '#fff',
                  padding: '6px 12px',
                  fontSize: '10px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  zIndex: 20
                }}
              >
                PAUSE
              </button>
              <span style={{ fontSize: '10px', fontWeight: 900, opacity: 0.2, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '12px' }}>Shields</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                {[...Array(3)].map((_, i) => (
                  <span key={i} style={{ 
                    fontSize: '24px', 
                    opacity: i < lives ? 1 : 0.05, 
                    filter: i < lives ? 'drop-shadow(0 0 10px rgba(255,89,94,0.8))' : 'none',
                    transition: 'all 0.5s ease'
                  }}>
                    ❤️
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ maxWidth: '100%', height: 'auto' }} />
            
            {(gameState === 'GAMEOVER' || gameState === 'WIN' || gameState === 'PAUSED') && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.92)',
                backdropFilter: 'blur(50px)',
                borderRadius: '48px',
                zIndex: 30
              }}>
                <div style={{ textAlign: 'center', padding: '4rem 6rem' }}>
                  {gameState === 'PAUSED' ? (
                    <>
                      <h2 style={{ fontSize: '5rem', fontWeight: 900, color: '#fff', marginBottom: '3.5rem', fontStyle: 'italic' }}>일시 정지</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px', margin: '0 auto' }}>
                        <button onClick={() => setGameState('PLAYING')} className="neo-button" style={{ fontSize: '1.5rem', padding: '1.5rem', borderRadius: '40px' }}>재개</button>
                        <button onClick={() => setGameState('HOME')} className="neo-button" style={{ fontSize: '1.5rem', padding: '1.5rem', borderRadius: '40px', backgroundColor: 'transparent', border: '3px solid rgba(255,255,255,0.2)', color: '#fff' }}>처음부터</button>
                        <button onClick={() => setGameState('HOME')} className="neo-button" style={{ fontSize: '1.5rem', padding: '1.5rem', borderRadius: '40px', backgroundColor: 'transparent', border: '3px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>종료</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 style={{ 
                        fontSize: '6rem', 
                        fontWeight: 900, 
                        marginBottom: '2rem', 
                        color: gameState === 'GAMEOVER' ? '#ff595e' : '#1982c4',
                        textTransform: 'uppercase',
                        fontStyle: 'italic',
                        lineHeight: 1
                      }}>
                        {gameState === 'GAMEOVER' ? '미션 실패' : '미션 성공'}
                      </h2>

                      {/* Leaderboard Section */}
                      <div style={{ 
                        background: 'rgba(255,255,255,0.02)', 
                        padding: '2rem', 
                        borderRadius: '40px', 
                        marginBottom: '3rem',
                        border: '1px solid rgba(255,255,255,0.05)',
                        minWidth: '320px'
                      }}>
                        <p style={{ fontSize: '10px', fontWeight: 900, opacity: 0.2, letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: '1.5rem' }}>Top Operators</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {rankings.length > 0 ? (
                            rankings.map((r, i) => (
                              <div key={i} style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                padding: '12px 24px',
                                background: i === 0 ? 'rgba(255,255,255,0.05)' : 'transparent',
                                borderRadius: '16px',
                                border: i === 0 ? '1px solid rgba(25,130,196,0.2)' : 'none'
                              }}>
                                <span style={{ fontWeight: 900, color: i === 0 ? '#1982c4' : '#fff', opacity: i === 0 ? 1 : 0.4 }}>
                                  {i === 0 ? '1ST' : i === 1 ? '2ND' : '3RD'}
                                </span>
                                <span style={{ fontWeight: 900, color: '#fff' }}>{r.name}</span>
                                <span style={{ fontWeight: 900, color: '#fff', opacity: 0.6 }}>{formatTime(r.time)}</span>
                              </div>
                            ))
                          ) : (
                            <p style={{ fontSize: '14px', fontWeight: 700, opacity: 0.3 }}>Empty Archive</p>
                          )}
                        </div>
                      </div>

                      <div style={{ marginBottom: '4rem' }}>
                        <p style={{ fontSize: '11px', fontWeight: 900, opacity: 0.2, letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: '14px' }}>Mission Performance</p>
                        <p style={{ fontSize: '3rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.05em', marginBottom: '10px' }}>
                          {gameState === 'WIN' ? `SUCCESS: ${finalTime}` : ''}
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                        <button onClick={() => setGameState('HOME')} className="neo-button" style={{ 
                          fontSize: '1.25rem', 
                          padding: '1.25rem 1.5rem', 
                          borderRadius: '60px', 
                          width: '100%',
                          fontWeight: 900 
                        }}>다시 시작</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '3.5rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ 
              padding: '12px 32px', 
              background: 'rgba(255,255,255,0.03)', 
              borderRadius: '100px', 
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: '10px',
              fontWeight: 900,
              opacity: 0.2,
              letterSpacing: '0.4em',
              textTransform: 'uppercase'
            }}>
              Input Device: Integrated Mouse + A-W-S-D
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


