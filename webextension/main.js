/*
Copyright (c) 2017 Dirk-jan Mollema
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

function createMenus(){
  // Create main menu
  let srvget = browser.storage.local.get('servers');
  srvget.then(function(settings){
    let servers = settings['servers'];
    if(typeof servers == 'undefined' || servers.length == 0){
      browser.menus.create({
        title: "Add a server for Send to Kodi",
        contexts: ['audio','video','link'],
        onclick: openSettings
      });
    }else{
      browser.menus.create({
        id: "stk-playon",
        title: "Play on",
        icons: {
          "16": 'data/img/play.svg'
        },
        contexts: ['audio','video','link'],
      });
      // Add "Edit servers"
      browser.menus.create({
        contexts: ['audio','video','link'],
        type: "separator"
      });
      browser.menus.create({
        title: "Manage servers",
        contexts: ['audio','video','link'],
        onclick: openSettings
      });
      window.sdata = addSendToServers(servers);
    }
  });
}

function addSendToServers(servers){
  var sdata = new Map();
  var i = 1000;
  servers.forEach(function (server) {
    sdata.set(i.toString(),server);
    browser.menus.create({
      id: (i++).toString(),
      parentId: "stk-playon",
      title: server.label,
      onclick: handleSubMenuClick,
      contexts: ['audio','video','link'],
    });
  });
  return sdata;
}



function displayMessage(m_title, message, type) {
  //if (!prefs.shownotify && type != 'error') return; //User doesn't want notifications
  browser.notifications.create({
    type: 'basic',
    message: message,
    title: 'Send to Kodi - ' + m_title
  });
}

// Remove the individual server menus
function removeSendToServers(sdata){
  sdata.forEach(function (server, menuid) {
    browser.menus.remove(menuid);
  });
}

// Open settings page
function openSettings(){
  browser.runtime.openOptionsPage();
}

function handleSubMenuClick(clickdata){
  // Determine whether the clicked object was a media object, but ignore images
  if(typeof clickdata['mediaType'] == 'undefined' || clickdata['mediaType'] == 'image'){
    // User clicked a link
    ur = new URL(clickdata['linkUrl']);
    parseUrlPlay(ur.href, ur.pathname, window.sdata.get(clickdata['menuItemId']));
  } else {
    // Audio or video element
    ur = new URL(clickdata['srcUrl']);
    parseUrlPlay(ur.href, ur.pathname, window.sdata.get(clickdata['menuItemId']));
  }
}

//Parse an url to send
function parseUrlPlay(url, pathname, playhost) {
  var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/;
  var match = url.match(regExp);
  if (match && match[2].length == 11) {
    sendYouTube(match[2], playhost);
    return;
  }
  var regExp2 = /^.*(youtube.com\/watch.*[\?\&]v=)([^#\&\?]*).*/;
  var match2 = url.match(regExp2);
  if (match2 && match2[2].length == 11) {
    sendYouTube(match2[2], playhost);
    return;
  }
  if(pathname === ''){
    //Dont extra check the extension
    sendToKodi(url,playhost);
    return;
  }
  var ext = pathname.split('.').pop();
  //Supported extensions
  if (/^(mp4|mkv|mov|mp3|avi|flv|wmv|asf|flac|mka|m4a|aac|ogg|pls|jpg|png|gif|jpeg|tiff|webm|webm|oga|ogv)$/.test(ext)) {
    sendToKodi(url, playhost);
    return;
  }
  displayMessage('Error', 'The following url is not supported: ' + url, 'error');
}

//Send a YouTube video
function sendYouTube(ytid, playhost) {
  var url = 'plugin://plugin.video.youtube/play/?video_id=' + ytid;
  sendToKodi(url, playhost);
}

//Send request to Kodi
function sendToKodi(fileurl, server) {
  // Construct headers
  serverurl = server.host +':'+server.port;
  postheaders = new Headers()
  postheaders.append('Content-Type','application/json');
  rurl = 'http://' + serverurl + '/jsonrpc';
  if (server.username && server.username !== '') {
    adata = btoa(server.username + ':' + server.password);
    postheaders.append('Authorization','Basic '+ adata);
  }

  var senddata = {
    "jsonrpc":"2.0",
    "method":"Player.Open",
    "params": {
      "item":{
        "file":fileurl
      }
    },
    "id": 1
  };
  displayMessage('Sending', 'Sending to Kodi...', 'info');
  rdata = {
    method: 'POST',
    body: JSON.stringify(senddata),
    headers: postheaders,
    credentials: 'include'
  }
  fetch(rurl, rdata).then(handleComplete);
}

//Handle return from Kodi
function handleComplete(resp) {
  if (resp.status == 200) {
    resp.json().then(function(jsondata){
      if (jsondata && jsondata.result) {
        if (jsondata.result == 'OK') {
          displayMessage('Success', 'Sent to Kodi', 'ok');
          return;
        }
      }
      if (typeof jsondata.error !== 'undefined') {
        if (typeof jsondata.error.data !== 'undefined' && jsondata.error.data.stack.message) {
          displayMessage('Kodi Error ' + jsondata.error.code, 'Kodi reported: ' + jsondata.error.data.stack.message + '', 'error');
          return;
        }
        if (typeof jsondata.error.message !== 'undefined') {
          displayMessage('Kodi Error ' + jsondata.error.code, 'Kodi reported: ' + jsondata.error.message + '', 'error');
          return;
        }
        displayMessage('Kodi Error ', 'Kodi reported error code ' + jsondata.error.code + '', 'error');
        return;
      }
    });
  } else {
    if (resp.status === 0) {
      displayMessage('Network error', 'Could not contact Kodi. Check your configuration.', 'error');
    } else {
      displayMessage('Status error ' + resp.status, 'Could not contact Kodi. Check your configuration. HTTP Status: ' + resp.status + ' ' + resp.statusText + '', 'error');
    }
  }
}

// Main
createMenus();