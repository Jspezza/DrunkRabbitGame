window.onload = function() {
  // --- Setup Canvas and Context ---
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const FPS = 60;

  // --- Constants ---
  const GRAVITY = 0.5;
  const JUMP_SPEED = -7;
  const BASE_ROCK_SPEED = 5;
  const MAX_ROCK_SPEED = BASE_ROCK_SPEED + 3; // 8
  const INVINCIBILITY_DURATION = 180; // in frames
  const BEER_DURATION = 300;
  const NEW_HIGH_DURATION = 120;
  const LIGHTNING_STRIKE_DURATION = 15;

  // --- Colors ---
  const COLORS = {
    WHITE: "#FFFFFF",
    BLACK: "#000000",
    BROWN: "#8B4513",
    RED: "#FF0000",
    YELLOW: "#FFDF00",
    SKY_BLUE: "#87CEEB",
    ORANGE: "#FFA500",
    DARK_YELLOW: "#C8AA00"
  };

  // --- Load Assets ---
  // Images
  const images = {};
  function loadImage(key, src) {
    const img = new Image();
    img.src = src;
    images[key] = img;
  }
  loadImage("rabbit", "rabbit.png");
  loadImage("rabbit_drunk", "rabbit_drunk.png");
  loadImage("rock", "rock.png");
  loadImage("beer", "beer.png");
  loadImage("carrot", "carrot.png");
  loadImage("pill", "pill.png");

  // Audio (using HTML5 Audio API)
  const audio = {};
  function loadAudio(key, src, volume = 1.0, loop = false) {
    const a = new Audio(src);
    a.volume = volume;
    a.loop = loop;
    audio[key] = a;
  }
  loadAudio("drunk2", "drunk2.mp3", 0.3);
  loadAudio("drunk3", "drunk3.mp3", 0.3);
  const drunkTracks = [audio["drunk2"], audio["drunk3"]];
  loadAudio("post5000", "post5000.mp3", 1.0, true);
  loadAudio("carrot_sound", "carrot_sound.mp3");
  loadAudio("coin_sound", "coin_sound.mp3", 0.25);

  let post5000Audio = audio["post5000"];
  let drunkAudio = null; // currently playing drunk track

  // --- Game State Variables ---
  let gameStarted = false;
  let gameOver = false;
  let frameCount = 0;
  let score = 0;
  let storedHighScore = 0;
  let scoreHistory = [];
  let scoreRecorded = false;
  let newHighTimer = 0;
  let newHighTriggered = false;
  let thunderTimer = getRandomInt(180, 360);
  let lightningStrikeActive = false;
  let lightningStrikeCounter = 0;
  let invincible = false;
  let invincibleTimer = 0;
  let beerActive = false;
  let beerTimer = 0;
  let spareLife = false;
  let lastPillSpawnScore = 3000;

  // Rabbit properties
  const rabbit = {
    x: 100,
    y: HEIGHT / 2 - 25,
    width: 50,
    height: 50,
    velY: 0
  };

  // Entity arrays
  let rockList = [];
  let coinList = [];
  let carrotList = [];
  let beerList = [];
  let pillList = [];
  let rainDrops = [];
  let distractions = [];

  // Timers (accumulated ms for entity creation)
  let rockTimer = 0;
  let coinTimer = 0;
  let carrotTimer = 0;
  let beerTimerEntity = 0;

  // Offsets for drunk mode and lightning effects
  let offsetX = 0, offsetY = 0;

  // --- Utility Functions ---
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function rectIntersect(r1, r2) {
    return !(r2.x > r1.x + r1.width ||
             r2.x + r2.width < r1.x ||
             r2.y > r1.y + r1.height ||
             r2.y + r2.height < r1.y);
  }

  function getValidSpawnY(entitySize) {
    let attempts = 0;
    while (attempts < 20) {
      const candidateY = getRandomInt(100, HEIGHT - 100);
      const candidateRect = { x: WIDTH, y: candidateY - entitySize / 2, width: entitySize, height: entitySize };
      let valid = true;
      for (let rock of rockList) {
        if (rectIntersect(candidateRect, rock)) {
          valid = false;
          break;
        }
      }
      if (valid) {
        return candidateY;
      }
      attempts++;
    }
    return getRandomInt(100, HEIGHT - 100);
  }

  function resetGame() {
    rabbit.y = HEIGHT / 2 - rabbit.height / 2;
    rabbit.velY = 0;
    rockList = [];
    coinList = [];
    carrotList = [];
    beerList = [];
    pillList = [];
    invincible = false;
    invincibleTimer = 0;
    beerActive = false;
    beerTimer = 0;
    spareLife = false;
    score = 0;
    scoreRecorded = false;
    newHighTimer = 0;
    newHighTriggered = false;
    thunderTimer = getRandomInt(180, 360);
    lightningStrikeActive = false;
    lightningStrikeCounter = 0;
    lastPillSpawnScore = 3000;
    if (post5000Audio) { post5000Audio.pause(); post5000Audio.currentTime = 0; }
    if (drunkAudio) { drunkAudio.pause(); drunkAudio.currentTime = 0; drunkAudio = null; }
    gameOver = false;
  }

  // --- Event Listeners ---
  document.addEventListener("keydown", function(e) {
    if (e.code === "Space") {
      if (!gameStarted) {
        gameStarted = true;
      } else if (gameOver) {
        resetGame();
      } else {
        rabbit.velY = JUMP_SPEED;
      }
    }
  });

  if ("ontouchstart" in window) {
    canvas.addEventListener("touchstart", function(e) {
      e.preventDefault();
      if (!gameStarted) {
        gameStarted = true;
      } else if (gameOver) {
        resetGame();
      } else {
        rabbit.velY = JUMP_SPEED;
      }
    }, false);
  }

  // --- Main Game Loop ---
  let lastTime = performance.now();
  function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }

  function update() {
    if (!gameStarted) return;
    frameCount++;

    rockTimer += 1000 / FPS;
    coinTimer += 1000 / FPS;
    carrotTimer += 1000 / FPS;
    beerTimerEntity += 1000 / FPS;

    if (!gameOver) {
      const currentSpeed = BASE_ROCK_SPEED + (Math.min(score, 10000) / 10000) * (MAX_ROCK_SPEED - BASE_ROCK_SPEED);
      rabbit.velY += GRAVITY;
      rabbit.y += rabbit.velY;

      if (rabbit.y < 0 || rabbit.y + rabbit.height > HEIGHT) {
        if (beerActive) {
          score -= 200;
          rabbit.y = HEIGHT / 2 - rabbit.height / 2;
          rabbit.velY = 0;
          beerActive = false;
          beerTimer = 0;
        } else {
          gameOver = true;
        }
      }

      const rabbitRect = { x: rabbit.x, y: rabbit.y, width: rabbit.width, height: rabbit.height };

      rockList.forEach(rock => { rock.x -= currentSpeed; });
      rockList = rockList.filter(rock => rock.x + rock.width > 0);
      coinList.forEach(coin => { coin.x -= currentSpeed; });
      coinList = coinList.filter(coin => coin.x + coin.width > 0);
      carrotList.forEach(carrot => { carrot.x -= currentSpeed; });
      carrotList = carrotList.filter(carrot => carrot.x + carrot.width > 0);
      beerList.forEach(beer => { beer.x -= currentSpeed; });
      beerList = beerList.filter(beer => beer.x + beer.width > 0);
      pillList.forEach(pill => { pill.x -= currentSpeed; });
      pillList = pillList.filter(pill => pill.x + pill.width > 0);

      for (let i = 0; i < rockList.length; i++) {
        if (rectIntersect(rabbitRect, rockList[i])) {
          if (invincible) {
            // do nothing
          } else if (beerActive) {
            score -= 200;
            beerActive = false;
            beerTimer = 0;
            rockList.splice(i, 1);
            break;
          } else if (spareLife) {
            spareLife = false;
            rockList.splice(i, 1);
            break;
          } else {
            gameOver = true;
            break;
          }
        }
      }

      for (let i = 0; i < coinList.length; i++) {
        if (rectIntersect(rabbitRect, coinList[i])) {
          score += 100;
          coinList.splice(i, 1);
          if (audio["coin_sound"] && !beerActive) {
            audio["coin_sound"].currentTime = 0;
            audio["coin_sound"].play();
          }
          break;
        }
      }

      for (let i = 0; i < carrotList.length; i++) {
        if (rectIntersect(rabbitRect, carrotList[i])) {
          invincible = true;
          invincibleTimer = INVINCIBILITY_DURATION;
          carrotList.splice(i, 1);
          if (audio["carrot_sound"] && !beerActive) {
            audio["carrot_sound"].currentTime = 0;
            audio["carrot_sound"].play();
          }
          break;
        }
      }

      for (let i = 0; i < beerList.length; i++) {
        if (rectIntersect(rabbitRect, beerList[i])) {
          beerActive = true;
          beerTimer = BEER_DURATION;
          beerList.splice(i, 1);
          score += 100;
          break;
        }
      }

      for (let i = 0; i < pillList.length; i++) {
        if (rectIntersect(rabbitRect, pillList[i])) {
          spareLife = true;
          pillList.splice(i, 1);
          break;
        }
      }

      if (invincible) {
        invincibleTimer--;
        if (invincibleTimer <= 0) {
          invincible = false;
        }
      }
      if (beerActive) {
        beerTimer--;
        if (beerTimer <= 0) {
          beerActive = false;
        }
      }

      score++;

      if (score > storedHighScore && !newHighTriggered) {
        newHighTriggered = true;
        newHighTimer = NEW_HIGH_DURATION;
      }
      if (newHighTimer > 0) {
        newHighTimer--;
      }

      if (score >= 3000 && !spareLife && pillList.length === 0 &&
          (score === 3000 || (score - lastPillSpawnScore) >= 750)) {
        const pillY = getValidSpawnY(40);
        const pillRect = { x: WIDTH, y: pillY - 20, width: 40, height: 40 };
        pillList.push(pillRect);
        lastPillSpawnScore = score;
      }

      if (score >= 4000) {
        thunderTimer--;
        if (thunderTimer <= 0) {
          lightningStrikeActive = true;
          lightningStrikeCounter = LIGHTNING_STRIKE_DURATION;
          thunderTimer = getRandomInt(180, 360);
        }
        if (lightningStrikeActive) {
          lightningStrikeCounter--;
          if (lightningStrikeCounter <= 0) {
            lightningStrikeActive = false;
          }
        }
      }

      if (rockTimer >= 1500) {
        const obstacleWidth = getRandomInt(100, 150);
        const difficultyFactor = Math.min(score / 5000, 1.0);
        const minGapEasy = 180;
        const maxGapEasy = 220;
        const minGapHard = 100;
        const maxGapHard = 140;
        const minGap = Math.floor((1 - difficultyFactor) * minGapEasy + difficultyFactor * minGapHard);
        const maxGap = Math.floor((1 - difficultyFactor) * maxGapEasy + difficultyFactor * maxGapHard);
        const gapSize = getRandomInt(minGap, maxGap);
        const gapY = getRandomInt(50, HEIGHT - gapSize - 50);
        const spawnOffset = getRandomInt(100, 250);
        const topRock = { x: WIDTH + spawnOffset, y: 0, width: obstacleWidth, height: gapY };
        const bottomRock = { x: WIDTH + spawnOffset, y: gapY + gapSize, width: obstacleWidth, height: HEIGHT - (gapY + gapSize) };
        rockList.push(topRock);
        rockList.push(bottomRock);
        rockTimer = 0;
      }
      if (coinTimer >= 2500) {
        const coinY = getValidSpawnY(30);
        const coinRect = { x: WIDTH, y: coinY - 15, width: 30, height: 30 };
        coinList.push(coinRect);
        coinTimer = 0;
      }
      if (carrotTimer >= 10000) {
        if (carrotList.length === 0 && beerList.length === 0) {
          const carrotY = getValidSpawnY(40);
          const carrotRect = { x: WIDTH, y: carrotY - 20, width: 40, height: 40 };
          carrotList.push(carrotRect);
        }
        carrotTimer = 0;
      }
      if (beerTimerEntity >= 15000) {
        if (beerList.length === 0 && carrotList.length === 0) {
          const beerY = getValidSpawnY(40);
          const beerRect = { x: WIDTH, y: beerY - 20, width: 40, height: 40 };
          beerList.push(beerRect);
        }
        beerTimerEntity = 0;
      }
    } else {
      // On game over, record the score and submit to Firebase using the stored player name.
      if (!scoreRecorded) {
        scoreHistory.push(score);
        if (scoreHistory.length > 10) {
          scoreHistory.shift();
        }
        scoreRecorded = true;
        
        // Use the globally stored player name.
        if (window.playerName && window.submitScore) {
          window.submitScore(window.playerName, score);
        }
      }
      if (score > storedHighScore) {
        storedHighScore = score;
      }
    }

    // --- Audio Handling ---
    if (score >= 3000) {
      if (post5000Audio.paused) {
        post5000Audio.play();
      }
      if (drunkAudio && !drunkAudio.paused) {
        drunkAudio.pause();
        drunkAudio = null;
      }
    } else {
      if (beerActive && !drunkAudio) {
        const track = drunkTracks[getRandomInt(0, drunkTracks.length - 1)];
        track.currentTime = 0;
        track.loop = true;
        track.play();
        drunkAudio = track;
      } else if (!beerActive && drunkAudio) {
        drunkAudio.pause();
        drunkAudio = null;
      }
    }

    // --- Calculate Offsets ---
    if (beerActive) {
      offsetX = 20 * Math.sin(frameCount / 5.0);
      offsetY = 20 * Math.cos(frameCount / 5.0);
    } else {
      offsetX = 0;
      offsetY = 0;
    }
    if (lightningStrikeActive && score >= 5000) {
      offsetX += getRandomInt(-15, 15);
      offsetY += getRandomInt(-15, 15);
    }

    // --- Heavy Rain Drops ---
    if (score >= 3000) {
      for (let i = 0; i < 20; i++) {
        rainDrops.push({
          x: getRandomInt(0, WIDTH),
          y: getRandomInt(-50, 0),
          speed: 10,
          length: 20
        });
      }
      rainDrops.forEach(drop => { drop.y += drop.speed; });
      rainDrops = rainDrops.filter(drop => drop.y < HEIGHT);
    }
  }

  // --- Draw Function ---
  function draw() {
    const bgThemes = [
      COLORS.SKY_BLUE,
      "rgb(240,248,255)",
      "rgb(255,228,225)",
      "rgb(221,160,221)",
      "rgb(240,230,140)"
    ];
    const bgIndex = Math.floor(score / 1000) % bgThemes.length;
    const bgColor = bgThemes[bgIndex];

    const sceneCanvas = document.createElement("canvas");
    sceneCanvas.width = WIDTH;
    sceneCanvas.height = HEIGHT;
    const sceneCtx = sceneCanvas.getContext("2d");

    sceneCtx.fillStyle = bgColor;
    sceneCtx.fillRect(0, 0, WIDTH, HEIGHT);

    rockList.forEach(rock => {
      if (images["rock"] && images["rock"].complete) {
        if (rock.y === 0) {
          sceneCtx.save();
          sceneCtx.translate(rock.x + rock.width/2, rock.y + rock.height/2);
          sceneCtx.scale(1, -1);
          sceneCtx.drawImage(images["rock"], -rock.width/2, -rock.height/2, rock.width, rock.height);
          sceneCtx.restore();
        } else {
          sceneCtx.drawImage(images["rock"], rock.x, rock.y, rock.width, rock.height);
        }
      } else {
        sceneCtx.fillStyle = COLORS.BROWN;
        sceneCtx.fillRect(rock.x, rock.y, rock.width, rock.height);
      }
    });

    coinList.forEach(coin => {
      sceneCtx.beginPath();
      sceneCtx.fillStyle = COLORS.YELLOW;
      sceneCtx.arc(coin.x + coin.width/2, coin.y + coin.height/2, coin.width/2, 0, Math.PI * 2);
      sceneCtx.fill();
    });

    carrotList.forEach(carrot => {
      if (images["carrot"] && images["carrot"].complete) {
        sceneCtx.drawImage(images["carrot"], carrot.x, carrot.y, carrot.width, carrot.height);
      } else {
        sceneCtx.beginPath();
        sceneCtx.fillStyle = COLORS.ORANGE;
        sceneCtx.arc(carrot.x + carrot.width/2, carrot.y + carrot.height/2, carrot.width/2, 0, Math.PI * 2);
        sceneCtx.fill();
      }
    });

    beerList.forEach(beer => {
      if (images["beer"] && images["beer"].complete) {
        sceneCtx.drawImage(images["beer"], beer.x, beer.y, beer.width, beer.height);
      } else {
        sceneCtx.fillStyle = COLORS.DARK_YELLOW;
        sceneCtx.fillRect(beer.x, beer.y, beer.width, beer.height);
      }
    });

    pillList.forEach(pill => {
      if (images["pill"] && images["pill"].complete) {
        sceneCtx.drawImage(images["pill"], pill.x, pill.y, pill.width, pill.height);
      } else {
        sceneCtx.fillStyle = "rgb(0,255,0)";
        sceneCtx.fillRect(pill.x, pill.y, pill.width, pill.height);
      }
    });

    if (beerActive && images["rabbit_drunk"] && images["rabbit_drunk"].complete) {
      sceneCtx.drawImage(images["rabbit_drunk"], rabbit.x, rabbit.y, rabbit.width, rabbit.height);
    } else if (images["rabbit"] && images["rabbit"].complete) {
      sceneCtx.drawImage(images["rabbit"], rabbit.x, rabbit.y, rabbit.width, rabbit.height);
    } else {
      sceneCtx.fillStyle = COLORS.BLACK;
      sceneCtx.fillRect(rabbit.x, rabbit.y, rabbit.width, rabbit.height);
    }

    if (invincible) {
      sceneCtx.strokeStyle = COLORS.ORANGE;
      sceneCtx.lineWidth = 4;
      sceneCtx.beginPath();
      sceneCtx.ellipse(rabbit.x + rabbit.width/2, rabbit.y + rabbit.height/2, rabbit.width/2 + 5, rabbit.height/2 + 5, 0, 0, Math.PI * 2);
      sceneCtx.stroke();
    }

    if (beerActive) {
      sceneCtx.fillStyle = "rgba(200,200,0,0.2)";
      sceneCtx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    if (score >= 3000) {
      rainDrops.forEach(drop => {
        sceneCtx.strokeStyle = "rgb(173,216,230)";
        sceneCtx.beginPath();
        sceneCtx.moveTo(drop.x, drop.y);
        sceneCtx.lineTo(drop.x, drop.y + drop.length);
        sceneCtx.stroke();
      });
    }

    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(sceneCanvas, offsetX, offsetY);

    if (lightningStrikeActive) {
      const flashAlpha = 200 * (lightningStrikeCounter / LIGHTNING_STRIKE_DURATION);
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha / 255})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    ctx.font = "24px sans-serif";
    ctx.fillStyle = (storedHighScore > 0 && score >= storedHighScore - 50 && score < storedHighScore) ? COLORS.RED : COLORS.BLACK;
    ctx.fillText("Score: " + score, 10, 30);
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillText("High Score: " + storedHighScore, WIDTH - 200, 30);

    if (spareLife) {
      if (images["pill"] && images["pill"].complete) {
        ctx.drawImage(images["pill"], WIDTH - 100, 50, 40, 40);
      } else {
        ctx.fillStyle = "rgb(0,255,0)";
        ctx.fillText("1UP", WIDTH - 100, 70);
      }
    }

    // --- Improved Centered Instructions Screen ---
    if (!gameStarted) {
      // Background for instructions
      ctx.fillStyle = COLORS.SKY_BLUE;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Define layout measurements
      const titleHeight = 60;
      const jumpInstructionsHeight = 60; // two lines
      const gapBetweenJumpAndPowerups = 20;
      const powerUpsTitleHeight = 40;
      const powerUpsListHeight = 50 * 4; // 4 power-ups at 50px each
      const gapBetweenPowerupsAndStart = 20;
      const startPromptHeight = 40;
      const totalHeight = titleHeight + jumpInstructionsHeight + gapBetweenJumpAndPowerups +
                          powerUpsTitleHeight + powerUpsListHeight + gapBetweenPowerupsAndStart +
                          startPromptHeight;
      let currentY = (HEIGHT - totalHeight) / 2;

      // Title
      ctx.font = "48px sans-serif";
      ctx.fillStyle = COLORS.BLACK;
      let titleText = "Drunk Rabbit Game";
      let titleWidth = ctx.measureText(titleText).width;
      ctx.fillText(titleText, WIDTH / 2 - titleWidth / 2, currentY + 48);
      currentY += titleHeight;

      // Jump instructions
      ctx.font = "24px sans-serif";
      let jumpText1 = "Tap the screen (or press SPACE) to jump!";
      let jumpText2 = "Faster taps yield higher jumps.";
      let jumpWidth1 = ctx.measureText(jumpText1).width;
      let jumpWidth2 = ctx.measureText(jumpText2).width;
      ctx.fillText(jumpText1, WIDTH / 2 - jumpWidth1 / 2, currentY + 24);
      ctx.fillText(jumpText2, WIDTH / 2 - jumpWidth2 / 2, currentY + 54);
      currentY += jumpInstructionsHeight;

      // Gap
      currentY += gapBetweenJumpAndPowerups;

      // Power-Ups Title
      ctx.font = "28px sans-serif";
      let powerUpTitle = "Power-Ups:";
      let puTitleWidth = ctx.measureText(powerUpTitle).width;
      ctx.fillText(powerUpTitle, WIDTH / 2 - puTitleWidth / 2, currentY + 28);
      currentY += powerUpsTitleHeight;

      // Define block for power-ups list (80% of canvas width)
      const blockWidth = WIDTH * 0.8;
      const iconSize = 40;
      const iconX = (WIDTH - blockWidth) / 2;
      const textX = iconX + iconSize + 10;
      const powerUps = [
        { key: "coin", text: "Coin: +100 points" },
        { key: "carrot", text: "Carrot: Temporary invincibility" },
        { key: "beer", text: "Beer: Drunk Mode (invincibility, +100, -200 on collision)" },
        { key: "pill", text: "Pill: Grants a spare life" }
      ];
      powerUps.forEach(pu => {
        if (pu.key === "coin") {
          ctx.beginPath();
          ctx.fillStyle = COLORS.YELLOW;
          ctx.arc(iconX + iconSize/2, currentY + iconSize/2, iconSize/2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          let img = images[pu.key];
          if (img && img.complete) {
            ctx.drawImage(img, iconX, currentY, iconSize, iconSize);
          } else {
            ctx.fillStyle = COLORS.BLACK;
            ctx.fillRect(iconX, currentY, iconSize, iconSize);
          }
        }
        ctx.font = "24px sans-serif";
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillText(pu.text, textX, currentY + iconSize/2 + 8);
        currentY += 50;
      });

      // Gap before start prompt
      currentY += gapBetweenPowerupsAndStart;

      // Start prompt
      ctx.font = "36px sans-serif";
      let startText = "Tap the screen or press SPACE to Start";
      let startWidth = ctx.measureText(startText).width;
      ctx.fillText(startText, WIDTH / 2 - startWidth / 2, currentY + 36);
    }

    if (gameOver) {
      ctx.font = "72px sans-serif";
      ctx.fillStyle = COLORS.RED;
      const gameOverText = "Game Over";
      const textWidth = ctx.measureText(gameOverText).width;
      ctx.fillText(gameOverText, WIDTH / 2 - textWidth / 2, HEIGHT / 2 - 60);
      ctx.font = "36px sans-serif";
      const restartText = "Press SPACE or tap to Restart";
      const restartWidth = ctx.measureText(restartText).width;
      ctx.fillText(restartText, WIDTH / 2 - restartWidth / 2, HEIGHT / 2);
      ctx.fillText("Last 10 Scores:", WIDTH / 2 - 100, HEIGHT / 2 + 50);
      scoreHistory.forEach((sc, idx) => {
        ctx.fillText((idx + 1) + ". " + sc, WIDTH / 2 - 100, HEIGHT / 2 + 80 + idx * 30);
      });
    }
  }

  requestAnimationFrame(gameLoop);
};
