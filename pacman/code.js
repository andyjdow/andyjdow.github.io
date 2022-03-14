function doGet(e) {
  /* let htmlOutput;
  Logger.log("doGet<"+e.queryString+">");
  if (e.queryString == "") {
    //htmlOutput = HtmlService.createHtmlOutputFromFile('setup');
    // Embedding the redirect 
    htmlOutput = HtmlService.createTemplateFromFile('setup').evaluate();
  } else {
    urlParams = e.parameter;
    if ("state" in urlParams) {
      if (urlParams["state"] == "game") {
        htmlOutput = HtmlService.createHtmlOutputFromFile('game');
      } else {
        htmlOutput = HtmlService.createHtmlOutput("Incorrect state!");  
      }
    } else {
      htmlOutput = HtmlService.createHtmlOutput("Incorrect URL query!");
    }
  }
  htmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return htmlOutput;*/
  //return ContentService.createTextOutput("Just some text!");
  var htmlOutput = HtmlService.createHtmlOutputFromFile('game');
  // user-scalable require to stop auto-zooming when using an input box on a mobile device
  htmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=no');
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
  sheet.appendRow([game, name, "registered", "", 0, 0, 0, 0, 0]);
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

function isHit(lat1,lng1,lat2,lng2,range) {
  if (Math.sqrt((lat1-lat2)**2+(lng1-lng2)**2) <= range) {
    return true;
  } else {
    return false;
  }
}

const pGame     = 0;
const pName     = 1;
const pState    = 2;
const pSubState = 3; // Lives aswell
const pScore    = 4;
const pLat      = 5;
const pLng      = 6;
const pStateEnd = 7;
const pGameEnd  = 8;

const oGame     = 0;
const oName     = 1;
const oLat      = 2;
const oLng      = 3;
const oRange    = 4;
const oActive   = 5;
const oStateEnd = 6;

const pacmanDeadTime      = 0.5 * 60000;
const ghostVulnerableTime = 2 * 60000;
const pacmanHitRange      = 0.0001;

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

  // First update player position
  var playerRange = playerSheet.getRange(playerIdx+1,1,1,pGameEnd+1); // All columns!
  var playerData  = playerRange.getValues();
  if (lat != -1) { 
    playerData[0][pLat] = lat;
    playerData[0][pLng] = lng;
  }
  playerRange.setValues(playerData);

  // Try to lock (wait 1sec??) and then update game state
  var lock = LockService.getScriptLock();
  if (lock.tryLock(1000)) {
    // 
    var ghostsVulnerable = false;
    // Fetch all player & object data
    playerRange   = playerSheet.getDataRange()
    playerData    = playerSheet.getDataRange().getValues();
    var objectRange = objectSheet.getDataRange();
    var objectData  = objectRange.getValues();
    if (playerData[playerIdx][pState] == "pacman") {
      for (var i = 0; i < objectData.length; i++) {
        // Check object is for this game and that it is "active"
        if (objectData[i][oGame] == game && objectData[i][oActive] == 1) {
          if (isHit(playerData[playerIdx][pLat],
                    playerData[playerIdx][pLng],
                    objectData[i][oLat],
                    objectData[i][oLng],
                    objectData[i][oRange])) {
            if (objectData[i][oName] == "bigdot") {
              ghostsVulnerable = true;
            }
            playerData[playerIdx][pScore] += 1; // TODO: Score based on what has been eaten!
            objectData[i][oActive]         = 0; // Eaten!
          }
        }
      }
      // Now check other players for ghosts
      // TODO: Randomise order
      for (var i = 0; i < playerData.length; i++) {
        if (ghosts.includes(playerData[i][pState]) || playerData[i][pState] == "ghost_vulnerable") {
          if (isHit(playerData[playerIdx][pLat],
                    playerData[playerIdx][pLng],
                    playerData[i][pLat],
                    playerData[i][pLng],
                    pacmanHitRange)) {
            // Who's eaten who?
            if (ghostsVulnerable || playerData[i][pState] == "ghost_vulnerable") {
              playerData[playerIdx][pScore] += 1; // TODO: Score
            } else {
              playerData[playerIdx][pState]    = "pacman_dead";
              playerData[playerIdx][pSubState]--; // Lives
              playerData[playerIdx][pStateEnd] = Date.now() + pacmanDeadTime;
              break;
            }
            // Always kill ghost
            if (playerData[i][pState] != "ghost_vulnerable") {
              playerData[i][pSubState] = playerData[i][pState]; // Retain ghosts name!
            }
            playerData[i][pState]      = "ghost_dead";

          } else if (ghostsVulnerable && playerData[i][pState] != "ghost_vulnerable") {
            // Not a hit so check if we need to update state
            playerData[i][pSubState] = playerData[i][pState]; // Retain ghosts name!
            playerData[i][pState]    = "ghost_vulnerable";
            playerData[i][pStateEnd] = Date.now() + ghostVulnerableTime;
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
            break;
          }
        }
      }
    } else if (playerData[playerIdx][pState] == "pacman_dead") {
      if (Date.now() > playerData[playerIdx][pStateEnd] && playerData[playerIdx][pSubState] > 0) {
        playerData[playerIdx][pState] = "pacman";
      }
    } else if (playerData[playerIdx][pState] == "ghost_vulnerable") {
      if (Date.now() > playerData[playerIdx][pStateEnd]) {
        playerData[playerIdx][pState] = playerData[playerIdx][pSubState]; // Re-instate ghost name
      }
    } else if (playerData[playerIdx][pState] == "ghost_dead") {
      // TODO: check for start zone...
    }
    // Update sheets
    playerRange.setValues(playerData); 
    objectRange.setValues(objectData);
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