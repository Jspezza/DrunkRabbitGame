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
  // Removed rabbit_carrot since it's not used.
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
  // Store the two drunk tracks in an array
  const drunkTracks = [audio["drunk2"], audio["drunk3"]];
  loadAudio("post5000", "post5000.mp3", 1.0, true);
  // Removed background audio since it's not used.
  loadAudio("carrot_sound", "carrot_sound.mp3");
  loadAudio("coin_sound", "coin_sound.mp3", 0.25);

  // We simulate separate “channels” by keeping track of which audio is playing:
  let post5000Audio = audio["post5000"];
  let drunkAudio = null; // will hold the currently playing drunk track

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
  let distractions = []; // reserved for future visual distractions

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

  // Mimics the get_valid_spawn_y from the Python code.
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
  // Desktop: jump via spacebar.
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

  // Mobile: if touch events are supported, use screen tap to jump.
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

  // --- Update Function (Game Logic) ---
  function update() {
    if (!gameStarted) return;
    frameCount++;

    // Increase timers (in ms; roughly 1000/FPS per frame)
    rockTimer += 1000 / FPS;
    coinTimer += 1000 / FPS;
    carrotTimer += 1000 / FPS;
    beerTimerEntity += 1000 / FPS;

    if (!gameOver) {
      // Calculate current speed (scaling with score)
      const currentSpeed = BASE_ROCK_SPEED + (Math.min(score, 10000) / 10000) * (MAX_ROCK_SPEED - BASE_ROCK_SPEED);

      // Apply gravity and update rabbit position
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

      // Move obstacles and power-ups
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

      // Check collisions with rocks
      for (let i = 0; i < rockList.length; i++) {
        if (rectIntersect(rabbitRect, rockList[i])) {
          if (invincible) {
            // Do nothing if invincible
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

      // Check collision with coin
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

      // Collision with carrot power-up
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

      // Collision with beer power-up
      for (let i = 0; i < beerList.length; i++) {
        if (rectIntersect(rabbitRect, beerList[i])) {
          beerActive = true;
          beerTimer = BEER_DURATION;
          beerList.splice(i, 1);
          score += 100;
          break;
        }
      }

      // Collision with pill power-up
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

      // Increase score gradually
      score++;

      if (score > storedHighScore && !newHighTriggered) {
        newHighTriggered = true;
        newHighTimer = NEW_HIGH_DURATION;
      }
      if (newHighTimer > 0) {
        newHighTimer--;
      }

      // Spawn pill power-up if conditions are met
      if (score >= 3000 && !spareLife && pillList.length === 0 &&
          (score === 3000 || (score - lastPillSpawnScore) >= 750)) {
        const pillY = getValidSpawnY(40);
        const pillRect = { x: WIDTH, y: pillY - 20, width: 40, height: 40 };
        pillList.push(pillRect);
        lastPillSpawnScore = score;
      }

      // Thunderstorm and lightning effect (for scores >= 4000)
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

      // --- Create New Entities Based on Timers ---
      if (rockTimer >= 1500) {
        // Create a pair of rock obstacles (top and bottom)
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
        const coinY = getValidSpawnY(30); // coin diameter = 30 (radius 15)
        const coinRect = { x: WIDTH, y: coinY - 15, width: 30, height: 30 };
        coinList.push(coinRect);
        coinTimer = 0;
      }
      if (carrotTimer >= 10000) {
        if (carrotList.length === 0 && beerList.length === 0) {
          const carrotY = getValidSpawnY(40); // carrot diameter = 40 (radius 20)
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
      // On game over, record the score once
      if (!scoreRecorded) {
        scoreHistory.push(score);
        if (scoreHistory.length > 10) {
          scoreHistory.shift();
        }
        scoreRecorded = true;
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
      // No background audio; only handle drunk mode.
      if (beerActive && !drunkAudio) {
        // Choose a random drunk track and play it on loop
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

    // --- Calculate Offsets for Drunk/Lightning Effects ---
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

    // --- Heavy Rain Drops (for score >= 3000) ---
    if (score >= 3000) {
      // Generate heavy rain: 20 drops per frame with fixed speed and drop length.
      for (let i = 0; i < 20; i++) {
        rainDrops.push({
          x: getRandomInt(0, WIDTH),
          y: getRandomInt(-50, 0),
          speed: 10,    // fixed speed for heavy rain
          length: 20    // fixed drop length for heavy rain
        });
      }
      rainDrops.forEach(drop => { drop.y += drop.speed; });
      rainDrops = rainDrops.filter(drop => drop.y < HEIGHT);
    }
  }

  // --- Draw Function ---
  function draw() {
    // Choose background color theme based on score
    const bgThemes = [
      COLORS.SKY_BLUE,
      "rgb(240,248,255)",
      "rgb(255,228,225)",
      "rgb(221,160,221)",
      "rgb(240,230,140)"
    ];
    const bgIndex = Math.floor(score / 1000) % bgThemes.length;
    const bgColor = bgThemes[bgIndex];

    // Create an offscreen canvas for the scene (to allow for offsets)
    const sceneCanvas = document.createElement("canvas");
    sceneCanvas.width = WIDTH;
    sceneCanvas.height = HEIGHT;
    const sceneCtx = sceneCanvas.getContext("2d");

    // Draw scene background
    sceneCtx.fillStyle = bgColor;
    sceneCtx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw rocks
    rockList.forEach(rock => {
      if (images["rock"] && images["rock"].complete) {
        // For top rocks, flip vertically
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

    // Draw coins
    coinList.forEach(coin => {
      sceneCtx.beginPath();
      sceneCtx.fillStyle = COLORS.YELLOW;
      sceneCtx.arc(coin.x + coin.width/2, coin.y + coin.height/2, coin.width/2, 0, Math.PI * 2);
      sceneCtx.fill();
    });

    // Draw carrots
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

    // Draw beer power-ups
    beerList.forEach(beer => {
      if (images["beer"] && images["beer"].complete) {
        sceneCtx.drawImage(images["beer"], beer.x, beer.y, beer.width, beer.height);
      } else {
        sceneCtx.fillStyle = COLORS.DARK_YELLOW;
        sceneCtx.fillRect(beer.x, beer.y, beer.width, beer.height);
      }
    });

    // Draw pills
    pillList.forEach(pill => {
      if (images["pill"] && images["pill"].complete) {
        sceneCtx.drawImage(images["pill"], pill.x, pill.y, pill.width, pill.height);
      } else {
        sceneCtx.fillStyle = "rgb(0,255,0)";
        sceneCtx.fillRect(pill.x, pill.y, pill.width, pill.height);
      }
    });

    // Draw rabbit:
    // Use the drunk image if beer is active; otherwise use the normal rabbit image.
    if (beerActive && images["rabbit_drunk"] && images["rabbit_drunk"].complete) {
      sceneCtx.drawImage(images["rabbit_drunk"], rabbit.x, rabbit.y, rabbit.width, rabbit.height);
    } else if (images["rabbit"] && images["rabbit"].complete) {
      sceneCtx.drawImage(images["rabbit"], rabbit.x, rabbit.y, rabbit.width, rabbit.height);
    } else {
      sceneCtx.fillStyle = COLORS.BLACK;
      sceneCtx.fillRect(rabbit.x, rabbit.y, rabbit.width, rabbit.height);
    }

    // Draw invincibility outline if active
    if (invincible) {
      sceneCtx.strokeStyle = COLORS.ORANGE;
      sceneCtx.lineWidth = 4;
      sceneCtx.beginPath();
      sceneCtx.ellipse(rabbit.x + rabbit.width/2, rabbit.y + rabbit.height/2, rabbit.width/2 + 5, rabbit.height/2 + 5, 0, 0, Math.PI * 2);
      sceneCtx.stroke();
    }

    // Draw drunk overlay if beer is active
    if (beerActive) {
      sceneCtx.fillStyle = "rgba(200,200,0,0.2)";
      sceneCtx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Draw heavy rain drops
    if (score >= 3000) {
      rainDrops.forEach(drop => {
        sceneCtx.strokeStyle = "rgb(173,216,230)";
        sceneCtx.beginPath();
        sceneCtx.moveTo(drop.x, drop.y);
        sceneCtx.lineTo(drop.x, drop.y + drop.length);
        sceneCtx.stroke();
      });
    }

    // Now draw the offscreen canvas onto the main canvas with offsets
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(sceneCanvas, offsetX, offsetY);

    // Draw lightning flash overlay if active
    if (lightningStrikeActive) {
      const flashAlpha = 200 * (lightningStrikeCounter / LIGHTNING_STRIKE_DURATION);
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha / 255})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // --- Draw HUD ---
    ctx.font = "24px sans-serif";
    ctx.fillStyle = (storedHighScore > 0 && score >= storedHighScore - 50 && score < storedHighScore) ? COLORS.RED : COLORS.BLACK;
    ctx.fillText("Score: " + score, 10, 30);
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillText("High Score: " + storedHighScore, WIDTH - 200, 30);

    // If spare life is active, draw the pill icon (or text)
    if (spareLife) {
      if (images["pill"] && images["pill"].complete) {
        ctx.drawImage(images["pill"], WIDTH - 100, 50, 40, 40);
      } else {
        ctx.fillStyle = "rgb(0,255,0)";
        ctx.fillText("1UP", WIDTH - 100, 70);
      }
    }

    // Draw New High Score message
    if (newHighTimer > 0) {
      const alpha = newHighTimer / NEW_HIGH_DURATION;
      ctx.font = "48px sans-serif";
      ctx.fillStyle = `rgba(255,0,0,${alpha})`;
      ctx.fillText("New High Score!", WIDTH / 2 - 100, 50);
    }

    // Draw the start screen if game hasn't started
    if (!gameStarted) {
      ctx.fillStyle = COLORS.SKY_BLUE;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.font = "24px sans-serif";
      const instructions = [
        "Drunk Rabbit Game",
        "Press SPACE or tap to jump and start.",
        "",
        "Power-Ups:",
        "  Coin: +100 points",
        "  Carrot: Temporary invincibility",
        "  Beer: Drunk Mode (invincibility, +100, -200 on collision)",
        "  Pill: Grants a spare life",
        "",
        "Avoid obstacles!",
        "Difficulty increases with your score."
      ];
      let yOffset = 50;
      instructions.forEach(line => {
        const textWidth = ctx.measureText(line).width;
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillText(line, WIDTH / 2 - textWidth / 2, yOffset);
        yOffset += 30;
      });
      ctx.font = "48px sans-serif";
      const startText = "Press SPACE or tap to Start";
      const textWidth = ctx.measureText(startText).width;
      ctx.fillText(startText, WIDTH / 2 - textWidth / 2, HEIGHT - 50);
    }

    // Draw game over screen if necessary
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

  // Start the loop
  requestAnimationFrame(gameLoop);
};
