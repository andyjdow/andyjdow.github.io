function doGet(e) {
  // Default
  var htmlOutput = HtmlService.createHtmlOutputFromFile('game');
  if (e) {
    if (e.parameter) {
      if (e.parameter["state"]) {
        if (e.parameter["state"] == "setup") {
          htmlOutput = HtmlService.createHtmlOutputFromFile('setup');
        }
        if (e.parameter["state"] == "design") {
          htmlOutput = HtmlService.createHtmlOutputFromFile('design');
        }
      }
    }
  }
  // user-scalable require to stop auto-zooming when using an input box on a mobile device
  htmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=no');
  htmlOutput.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // So we can embedded the web app in our own page (in an iframe)
  return htmlOutput;
}

function registerPlayer(game="test",name="dummy") {
  Logger.log('registerPlayer: '+game+" - "+name);

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Players'));
  var sheet = SpreadsheetApp.getActiveSheet();
  // Are they already registered?
  var playerData = sheet.getDataRange().getValues();
  for (var i = 0; i < playerData.length; i++) {
    if (playerData[i].length > 1) {
      if (playerData[i][0] == game && playerData[i][1] == name) {
        Logger.log('registerPlayer: Already registered');
        return i;
      }
    }
  }
  // Otherwise add to table
  sheet.appendRow([game, name, "registered", "", 0, 0, 0, 0, 0, 0]);
  // In case of another aync access now find the player
  var playerData = sheet.getDataRange().getValues();
  for (var i = 0; i < playerData.length; i++) {
    if (playerData[i].length > 1) {
      if (playerData[i][0] == game && playerData[i][1] == name) {
        return i;
      }
    }
  }
  Logger.log('registerPlayer: failed');
  return -1;
}

function calcDistance(lat1=55.8901103,lng1=-3.3440929,lat2=55.89026165,lng2=-3.343703808) {
//function calcDistance(lat1=55.877764,lng1=-3.342942,lat2=55.876952,lng2=-3.342362) {
  // Equirectangular approximation - from https://www.movable-type.co.uk/scripts/latlong.html
  // o Returns metres distance between 2 points
  latR1 = lat1 * Math.PI/180;
  latR2 = lat2 * Math.PI/180;
  lngR1 = lng1 * Math.PI/180;
  lngR2 = lng2 * Math.PI/180;
  x = (lngR2-lngR1) * Math.cos((latR2+latR1)/2);
  y = (latR2-latR1);
  d = Math.sqrt(x**2+y**2)*6371e3;
  Logger.log("d: "+d);
  return d;
}

function isHit(lat1,lng1,lat2,lng2,range) {
  // if (Math.sqrt((lat1-lat2)**2+(lng1-lng2)**2) <= range) {
  if (calcDistance(lat1,lng1,lat2,lng2) <= range) {
    return true;
  } else {
    return false;
  }
}

const pGame       = 0;
const pName       = 1;
const pState      = 2;
const pSubState   = 3; // Lives aswell
const pScore      = 4;
const pLat        = 5;
const pLng        = 6;
const pLastUpdate = 7;
const pStateEnd   = 8;
const pGameEnd    = 9;

const oGame     = 0;
const oName     = 1;
const oLat      = 2;
const oLng      = 3;
const oRange    = 4;
const oActive   = 5;
const oStateEnd = 6;

const pacmanDeadTime      = 0.25 * 60000;
const ghostVulnerableTime = 0.5 * 60000;
const pacmanHitRange      = 5; // meters 0.0001; // 0.00005; // 
const defaultObjectRange  = 5; // meters 0.0001;
const ghostSpeedLimit     = 1.5 // m/s - https://en.wikipedia.org/wiki/Preferred_walking_speed

const ghosts = ["blinky", "inky", "pinky", "clyde"];

function updatePlayer(game="test",playerIdx=1,lat=55.87981,lng=-3.32902) {
  Logger.log('updatePlayer: '+playerIdx+" at:"+lat+","+lng);
  // 
  // Get sheets
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Objects'));
  var objectSheet = SpreadsheetApp.getActiveSheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Players'));
  var playerSheet = SpreadsheetApp.getActiveSheet();

  // var gameOver = false;

  // Try to lock (wait 1sec??) and then update game state
  var lock = LockService.getScriptLock();
  if (lock.tryLock(1000) && playerIdx > -1) {

    // First update player position
    var playerRange = playerSheet.getRange(playerIdx+1,1,1,pGameEnd+1); // All columns!
    var playerData  = playerRange.getValues();
    if (lat != -1) { 
      if (playerData[0][pLat] != -1 && ghosts.includes(playerData[0][pState])) {
        // Check if ghost is going too fast
        var distance = calcDistance(lat,lng,playerData[0][pLat],playerData[0][pLng]); // Meters
        var time     = (Date.now() - playerData[0][pLastUpdate]) / 1e-3; // Seconds
        if (distance / time > ghostSpeedLimit) {
          playerData[0][pSubState] = playerData[0][pState]; // Retain ghosts name!
          playerData[0][pState]    = "ghost_vulnerable";
          playerData[0][pStateEnd] = Date.now() + ghostVulnerableTime;
        }
      }
      playerData[0][pLat]        = lat;
      playerData[0][pLng]        = lng;
      playerData[0][pLastUpdate] = Date.now();
    }
    playerRange.setValues(playerData);

    // Check not game over
    if (Date.now() < playerData[0][pGameEnd] || playerData[0][pGameEnd] == -1) {

      // 
      var ghostsVulnerable = false;
      // Fetch all player & object data
      playerRange   = playerSheet.getDataRange()
      playerData    = playerSheet.getDataRange().getValues();
      var objectRange = objectSheet.getDataRange();
      var objectData  = objectRange.getValues();
      var ghostHomeIdx = -1;
      if (playerData[playerIdx][pState] == "pacman") {
        for (var i = 0; i < objectData.length; i++) {
          // Check object is for this game and that it is "active"
          if (objectData[i][oGame] == game && objectData[i][oActive] == 1 && objectData[i][oName] != "home") {
            if (isHit(playerData[playerIdx][pLat],
                      playerData[playerIdx][pLng],
                      objectData[i][oLat],
                      objectData[i][oLng],
                      objectData[i][oRange])) {
              if (objectData[i][oName] == "bigdot") {
                ghostsVulnerable = true;
              }
              var score = 0;
              switch (objectData[i][oName]) {
              case "cherry":
                score = 200;
                break;
              case "apple":
                score = 200;
                break;
              case "orange":
                score = 200;
                break;
              case "strawberry":
                score = 200;
                break;
              case "smalldot":
                score = 10;
                break;
              case "bigdot":
                score = 50;
                break;
              default:
              }
              playerData[playerIdx][pScore] += score;
              objectData[i][oActive]         = 0; // Eaten!
            }
          }
        }
        // Now check other players for ghosts
        // TODO: Randomise order
        for (var i = 0; i < playerData.length; i++) {
          if (playerData[i][pGame] == game) {
            if (ghosts.includes(playerData[i][pState]) || playerData[i][pState] == "ghost_vulnerable") {
              if (isHit(playerData[playerIdx][pLat],
                        playerData[playerIdx][pLng],
                        playerData[i][pLat],
                        playerData[i][pLng],
                        pacmanHitRange)) {
                // Always kill ghost
                // o So pacman has a chance
                // o This needs to happen before the possibility of the break to ensure the ghost dies, otherwise get it can kill pacman again!
                if (playerData[i][pState] != "ghost_vulnerable") {
                  playerData[i][pSubState] = playerData[i][pState]; // Retain ghosts name!
                }
                playerData[i][pState]      = "ghost_dead";
                // Who's eaten who?
                if (ghostsVulnerable || playerData[i][pState] == "ghost_vulnerable") {
                  playerData[playerIdx][pScore] += 500;
                } else {
                  playerData[playerIdx][pState]    = "pacman_dead";
                  playerData[playerIdx][pSubState]--; // Lives
                  playerData[playerIdx][pStateEnd] = Date.now() + pacmanDeadTime;
                  playerData[i][pScore]            += 500; // Same points for eating pacman
                  break;
                }
              } else if (ghostsVulnerable && playerData[i][pState] != "ghost_vulnerable") {
                // Not a hit so check if we need to update state
                playerData[i][pSubState] = playerData[i][pState]; // Retain ghosts name!
                playerData[i][pState]    = "ghost_vulnerable";
                playerData[i][pStateEnd] = Date.now() + ghostVulnerableTime;
              }
            }
          }
        }
      } else if (ghosts.includes(playerData[playerIdx][pState])) {
        // Look for pacman and see if we can eat him!
        for (var i = 0; i < playerData.length; i++) {
          if (playerData[i][pState] == "pacman") {
            if (isHit(playerData[playerIdx][pLat],
                      playerData[playerIdx][pLng],
                      playerData[i][pLat],
                      playerData[i][pLng],
                      pacmanHitRange)) {
              playerData[i][pState]    = "pacman_dead";
              playerData[i][pSubState]--; // Lives
              playerData[i][pStateEnd] = Date.now() + pacmanDeadTime;
              // Ghost also dies
              playerData[playerIdx][pSubState] = playerData[playerIdx][pState]; // Retain ghosts name!
              playerData[playerIdx][pState]    = "ghost_dead";
              playerData[playerIdx][pScore]    += 500; // Same score for the ghost
              break;
            }
          }
        }
      } else if (playerData[playerIdx][pState] == "pacman_dead") {
        if (Date.now() > playerData[playerIdx][pStateEnd] && playerData[playerIdx][pSubState] > 0) {
          playerData[playerIdx][pState] = "pacman";
        }
        // Has pacman run out of lives
        if (playerData[playerIdx][pSubState] == 0) {
          Logger.log("pac man dead! - game over ....");
          // Update game end for all players
          for (var i = 0; i < playerData.length; i++) {
            if(playerData[i][pGame] == game) {
              playerData[i][pGameEnd] = Date.now();
            }
          }
        }
      } else if (playerData[playerIdx][pState] == "ghost_vulnerable") {
        if (Date.now() > playerData[playerIdx][pStateEnd]) {
          playerData[playerIdx][pState] = playerData[playerIdx][pSubState]; // Re-instate ghost name
        }
      } else if (playerData[playerIdx][pState] == "ghost_dead") {
        // Check for start zone...
        for (var i = 0; i < objectData.length; i++) {
          if (objectData[i][oGame] == game && objectData[i][oName] == "home") {
            if (isHit(playerData[playerIdx][pLat],
                      playerData[playerIdx][pLng],
                      objectData[i][oLat],
                      objectData[i][oLng],
                      objectData[i][oRange])) {
              // Change back to a full ghost
              playerData[playerIdx][pState] = playerData[playerIdx][pSubState];
            }
          }
        }
      }
      // Update sheets
      playerRange.setValues(playerData); 
      objectRange.setValues(objectData);

    } //else {
    //   gameOver = true;
    // }

    // 
    lock.releaseLock();
  }
    
  // Now fetch all player  & object data and return state to client
  var gameStatus        = {};
  gameStatus["players"] = [];
  gameStatus["objects"] = []; 
  playerData            = playerSheet.getDataRange().getValues();
  for (var i = 0; i < playerData.length; i++) {
    if (playerData[i][pGame] == game) {
      var playerStatus = {
        "name"     : playerData[i][pName],
        "state"    : playerData[i][pState],
        "substate" : playerData[i][pSubState],
        "score"    : playerData[i][pScore],
        "lat"      : playerData[i][pLat],
        "lng"      : playerData[i][pLng],
        "idx"      : i
      }
      // Override sub-state
      // o Can't use the gameOver flag as it is only set if this updatePlayer call has obtained the lock
      // if (gameOver) {
      //   playerStatus["substate"] = "gameover";
      // }
      if (Date.now() > playerData[i][pGameEnd] && playerData[i][pGameEnd] != -1) {
        playerStatus["substate"] = "gameover"; 
      }
      gameStatus["players"].push(playerStatus);
    }
  }
  // Get objects
  var objectData  = objectSheet.getDataRange().getValues();
  for (var i = 0; i < objectData.length; i++) {
    // Check object is for this game and that it is "active"
    if (objectData[i][oGame] == game && objectData[i][oActive] == 1) {
      var objectStatus = {
        "name"  : objectData[i][oName],
        "lat"   : objectData[i][oLat],
        "lng"   : objectData[i][oLng],
        "idx"   : i
      }
      gameStatus["objects"].push(objectStatus);
    }
  }
  return gameStatus;
}

function getPlayers(game="test") {
  Logger.log("getPlayers...");
  // 
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Players'));
  var playerSheet = SpreadsheetApp.getActiveSheet();
  var playerData  = playerSheet.getDataRange().getValues();
  var players = [];
  for (var i = 0; i < playerData.length; i++) {
    if (playerData[i][pGame] == game) {
      var playerStatus = {
        "name"     : playerData[i][pName],
        "state"    : playerData[i][pState],
        "substate" : playerData[i][pSubState],
        "score"    : playerData[i][pScore],
        "lat"      : playerData[i][pLat],
        "lng"      : playerData[i][pLng],
        "idx"      : i
      }
      players.push(playerStatus);
    }
  }
  return players;
}

function resetPlayers(players,lives=3,gameLength=-1,clearScore=0) {
  Logger.log("resetPlayers...");
  // 
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Players'));
  var playerSheet = SpreadsheetApp.getActiveSheet();
  var lock = LockService.getScriptLock();
  if (lock.tryLock(60000)) {  // 60 sec wait
    players.forEach(function(player) {
      var playerRange = playerSheet.getRange(player["idx"]+1,1,1,pGameEnd+1); // All columns!
      var playerData  = playerRange.getValues();
      playerData[0][pState]     = player["state"];
      if (gameLength == -1) {
        playerData[0][pGameEnd]   = -1;
      } else {
        playerData[0][pGameEnd]   = Date.now()+(gameLength*60000);
      }
      if (player["state"]=="pacman") {
        playerData[0][pSubState] = lives;
      } else {
        playerData[0][pSubState] = "";
      }
      if (clearScore==1) {
       playerData[0][pScore] = 0;
      }
      playerRange.setValues(playerData);
    });
  }
  lock.releaseLock();
}

function getObjects(game="test") {
  Logger.log("getObjects...");
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Objects'));
  var objectSheet = SpreadsheetApp.getActiveSheet();
  var objectData  = objectSheet.getDataRange().getValues();
  var objects = [];
  for (var i = 0; i < objectData.length; i++) {
    // Check object is for this game and that it is "active"
    if (objectData[i][oGame] == game && objectData[i][oActive] == 1) {
      var objectStatus = {
        "name"  : objectData[i][oName],
        "lat"   : objectData[i][oLat],
        "lng"   : objectData[i][oLng],
        "idx"   : i
      }
      objects.push(objectStatus);
    }
  }
  return objects;
}

function resetObjects(game="test") {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Objects'));
  var objectSheet = SpreadsheetApp.getActiveSheet();
  var objectRange = objectSheet.getDataRange();
  var objectData  = objectRange.getValues();
  var lock = LockService.getScriptLock();
  if (lock.tryLock(60000)) {
    for (var i = 0; i < objectData.length; i++) {
      // Check object is for this game
      if (objectData[i][oGame] == game) {
        objectData[i][oActive] = 1; // set to active
      }
    }
    objectRange.setValues(objectData);
  }
  lock.releaseLock();
}

function updateObjects(game,objects) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Objects'));
  var objectSheet = SpreadsheetApp.getActiveSheet();
  var lock = LockService.getScriptLock();
  if (lock.tryLock(60000)) {
    objects.forEach(function(object) {
      // Only interested in new objects
      if (object["idx"] < 0) {
        objectSheet.appendRow([game, object["name"], object["lat"], object["lng"], defaultObjectRange, 1, 0 ]);
      }
    });
  }
  lock.releaseLock()
}
