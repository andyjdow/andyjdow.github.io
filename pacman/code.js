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

// function doPost(e) {
//   /*var postData = e.postData.contents;
//   if ("action" in postData) {
//     var action  = postData["action"];
//     if (postData["action"] == "register") {
//       return "whoop!"
//     } else {
//       return "Unknown action "+action;
//     }
//   } else {
//     return "No action!"
//   }*/
//   return ContentService.createTextOutput("doPost was sent: \n"+e.postData.contents);
// }

// function registerTeam(name,lat,lng) {
//   Logger.log('registerTeam: '+name+" at:"+lat+","+lng);
//   var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
//   SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Teams'));
//   var sheet = SpreadsheetApp.getActiveSheet();
//   sheet.appendRow([name, lat, lng]);
// }

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
  sheet.appendRow([game, name, "registered", "", 0, 0, 0]);
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

function isHit(lat1,lng1,lat2,lng2) {
  if (Math.sqrt((lat1-lat2)**2+(lng1-lng2)**2) <= 0.0001) {
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
const oActive   = 4;
const oStateEnd = 5;

const pacmanDeadTime      = 0.5 * 60000;
const ghostVulnerableTime = 2 * 60000;

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
    // Fetch all player data
    playerRange   = playerSheet.getDataRange().getValues();
    playerData    = playerRange.getValues();
    if (playerData[playerIdx][pState] == "pacman") {
      // Get object data & check if anything has been eaten
      var objectData= objectSheet.getDataRange().getValues();
      for (var i = 0; i < objectData.length; i++) {
        // Check object is for this game and that it is "active"
        if (objectData[i][oGame] == game && objectData[i][oActive] == 1) {
          if (isHit(playerData[playerIdx][pLat],
                    playerData[playerIdx][pLng],
                    objectData[i][oLat],
                    objectData[i][oLng])) {
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
                    playerData[i][pLng])) {
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
                    playerData[i][pLng])) {
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

  // Now fetch all player data and return state to client
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
  // SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Objects'));
  // var objectSheet = SpreadsheetApp.getActiveSheet();
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
  // // Game state update
  // var ghostsVulnerable = false;
  // for (var i = 0; i < gameStatus["players"].length; i++) {
  //   if (gameStatus["players"][i]["state"] == "pacman") {
  //     playerRange = playerSheet.getRange(gameStatus["players"][i]["idx"]+1,1,1,pGameEnd+1); // All columns!
  //     playerData  = playerRange.getValues();
  //     // Check for objects to eat
  //     var newObjects = [];
  //     for (var j = 0; j < gameStatus["objects"].length; j++) {
  //       if (isHit(gameStatus["players"][i]["lat"], // Current player
  //                 gameStatus["players"][i]["lng"],
  //                 gameStatus["objects"][j]["lat"],
  //                 gameStatus["objects"][j]["lng"])) {
  //         var objectRange  = objectSheet.getRange(gameStatus["objects"][j]["idx"]+1,1,1,pStateEnd+1); // All columns, different to Players
  //         objectData       = objectRange.getValues();
  //         objectData[0][pActive] = 0; // Eaten!
  //         if (gameStatus["objects"][j]["name"]=="bigdot") {
  //           ghostsVulnerable = true;
  //         }
  //         gameStatus["players"][i]["score"]++; // TODO set based on what has been eaten
  //       } else {
  //         // Not eaten so return to client to display
  //         newObjects.push(gameStatus["objects"][j]);
  //       }
  //     }
  //     gameStatus["objects"] = newObjects; // Update object list
  //     // Check for other players who are ghosts
  //     for (var j = 0; j < gameStatus["players"].length; j++) {
  //       if (gameStatus["players"][j]["state"] = "ghost_vulnerable") {
  //         ghostsVulnerable = true;
  //       }
  //       if (ghosts.includes(gameStatus["players"][j]["state"]) || ghostsVulnerable) {
  //         // Has the ghost eaten pacman?
  //         if (isHit(gameStatus["players"][i]["lat"], // Current player
  //                   gameStatus["players"][i]["lng"],
  //                   gameStatus["players"][j]["lat"], // Player we're checking
  //                   gameStatus["players"][j]["lng"])) {
  //           // Update ghost (j) - always kill ghost to give PacMAN a chance
  //           var ghostRange                        = playerSheet.getRange(gameStatus["players"][j]["idx"]+1,1,1,pGameEnd+1); // All columns!
  //           ghostData                             = ghostRange.getValues();
  //           gameStatus["players"][j]["substate"]  = gameStatus["players"][j]["state"]; // Retain ghosts name!
  //           gameStatus["players"][j]["state"]     = "ghost_dead";
  //           if (not(ghostsVulnerable)) {
  //             gameStatus["players"][j]["score"]++; 
  //           }
  //           ghostData[0][pState]                 = gameStatus["players"][j]["state"];
  //           ghostData[0][pSubState]              = gameStatus["players"][j]["substate"];
  //           ghostData[0][pScore]                 = gameStatus["players"][j]["score"];
  //           ghostRange.setValues(playerData);
  //           // Update current player (i)
  //           if (ghostsVulnerable) {
  //             gameStatus["players"][i]["score"]++;
  //           } else {
  //             gameStatus["players"][j]["state"] = "pacman_dead";
  //             gameStatus["players"][j]["substate"]--;
  //           }
  //           playerData[0][pState]                 = gameStatus["players"][i]["state"];
  //           playerData[0][pSubState]              = gameStatus["players"][i]["substate"];
  //           playerData[0][pScore]                 = gameStatus["players"][i]["score"];
  //           playerRange.setValues(playerData);
  //           // Stop check so only one ghost gets points.....
  //           // TODO: what about order..... always first in list....
  //           break;
  //         } // isHit
  //       } // ghost check
  //     } // check other players
  //   }
  // }
  // // Game update loop 2
  // if (ghostsVulnerable) {
  //   for (var i = 0; i < gameStatus["players"].length; i++) {
  //     if (ghosts.includes(gameStatus["players"][i]["state"])) {
  //       playerRange = playerSheet.getRange(gameStatus["players"][i]["idx"]+1,1,1,pGameEnd+1); // All columns!
  //       playerData  = playerRange.getValues();
  //       // Update ghost state
  //       gameStatus["players"][i]["substate"]  = gameStatus["players"][i]["state"]; // Retain ghosts name!
  //       gameStatus["players"][i]["state"]     = "ghost_vulnerable";
  //       playerData[0][pState]                 = gameStatus["players"][i]["state"];
  //       playerData[0][pSubState]              = gameStatus["players"][i]["substate"];
  //       playerRange.setValues(playerData);
  //     }
  //   }
  // }
  return gameStatus;
 }