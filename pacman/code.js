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

function updatePlayer(game="test",playerIdx=1,lat=55.87981,lng=-3.32902) {
  Logger.log('updatePlayer: '+playerIdx+" at:"+lat+","+lng);
  // 
  const ghosts = ["blinky", "inky", "pinky", "clyde"];
  // Get Players sheet
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Players'));
  var playerSheet = SpreadsheetApp.getActiveSheet();
  // First update player position
  var playerRange = playerSheet.getRange(playerIdx+1,1,1,7); // All columns!
  var playerData  = playerRange.getValues();
  if (lat != -1) { 
    playerData[0][5] = lat;
    playerData[0][6] = lng;
  }
  playerRange.setValues(playerData);

  // Now fetch all player data and return state to client
  var gameStatus = {};
  gameStatus["players"] = [];
  gameStatus["objects"] = []; // TODO!!
  playerData = playerSheet.getDataRange().getValues();
  for (var i = 0; i < playerData.length; i++) {
    if (playerData[i][0] == game) {
      var playerStatus = {
        "name"  : playerData[i][1],
        "state" : playerData[i][2],
        "event" : playerData[i][3],
        "score" : playerData[i][4],
        "lat"   : playerData[i][5],
        "lng"   : playerData[i][6],
        "idx"   : i
      }
      gameStatus["players"].push(playerStatus);
    }
  }
  // Get objects
  SpreadsheetApp.setActiveSheet(spreadsheet.getSheetByName('Objects'));
  var objectSheet = SpreadsheetApp.getActiveSheet();
  var objectData   = objectSheet.getDataRange().getValues();
  for (var i = 0; i < objectData.length; i++) {
    // Check object is for this game and that it is "active"
    if (objectData[i][0] == game && objectData[i][4] == 1) {
      var objectStatus = {
        "name"  : objectData[i][1],
        "lat"   : objectData[i][2],
        "lng"   : objectData[i][3],
        "idx"   : i
      }
      gameStatus["objects"].push(objectStatus);
    }
  }
  // Game state update
  for (var i = 0; i < gameStatus["players"].length; i++) {
    if (gameStatus["players"][i]["state"] == "pacman") {
      // Check for other players who are ghosts
      for (var j = 0; j < gameStatus["players"].length; j++) {
        if (ghosts.includes(gameStatus["players"][j]["state"])) {
          // Has the ghost eaten pacman?
          if (isHit(gameStatus["players"][i]["lat"], // Current player
                    gameStatus["players"][i]["lng"],
                    gameStatus["players"][j]["lat"], // Player we're checking
                    gameStatus["players"][j]["lng"])) {
            playerRange       = playerSheet.getRange(gameStatus["players"][i]["idx"]+1,1,1,7); // All columns!
            playerData        = playerRange.getValues();
            playerData[0][2]  = "pacman_dead";
            playerRange.setValues(playerData);
          }
        }
      }
      // Check for objects to eat
      for (var j = 0; j < gameStatus["objects"].length; j++) {
        if (isHit(gameStatus["players"][i]["lat"], // Current player
                  gameStatus["players"][i]["lng"],
                  gameStatus["objects"][j]["lat"],
                  gameStatus["objects"][j]["lng"])) {
          var objectRange  = objectSheet.getRange(gameStatus["objects"][j]["idx"]+1,1,1,5); // All columns, different to Players
          objectData       = objectRange.getValues();
          objectData[0][4] = 0; // Eaten!
          // Remove from return list.....
        }
      }
    }
  }
  return gameStatus;
 }