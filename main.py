#!/usr/bin/env python3
"""
mako — AI Kitsune Companion
Single-file: VRM model viewer + AI chat + Windows automation
Run with: python main.py
"""

import os
import sys
import json
import re
import math
import random
import threading
import asyncio
import time
import datetime
import subprocess
import socket
import urllib.parse
import io
import base64
import webbrowser
import traceback
import mimetypes
import queue as queue_module
from pathlib import Path
from html.parser import HTMLParser

import requests as http_requests
from flask import Flask, request, jsonify, send_from_directory, Response
from groq import Groq, RateLimitError, APIStatusError
import websockets
from http.server import HTTPServer, SimpleHTTPRequestHandler

# ════════════════════════════════════════════════════════════════
# EMBEDDED HTML ASSETS
# ════════════════════════════════════════════════════════════════

VRM_VIEWER_HTML = r"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mako — AI Kitsune</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0c0c14;color:#eee;font-family:system-ui,sans-serif;overflow:hidden;width:100vw;height:100vh}
#canvas{position:fixed;inset:0;z-index:0}
#canvas canvas{display:block;width:100%!important;height:100%!important}

/* ── Top bar ── */
#top-bar{position:fixed;top:0;left:0;right:0;z-index:10;display:flex;justify-content:flex-end;align-items:center;padding:12px 16px;gap:10px;pointer-events:none}
#top-bar>*{pointer-events:auto}
.model-status{font-size:11px;color:#7a7aaa;font-family:monospace;background:rgba(15,15,30,0.7);padding:4px 10px;border-radius:6px;border:1px solid #2a2a40;margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}
.ws-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#444;transition:.3s;margin-right:4px;vertical-align:middle}
.ws-dot.on{background:#00e676;box-shadow:0 0 6px #00e67688}
.gear-btn{width:34px;height:34px;border-radius:50%;border:1px solid #2a2a50;background:rgba(15,15,30,0.85);color:#9a9aca;font-size:18px;cursor:pointer;transition:.2s;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
.gear-btn:hover{border-color:#c97fff;color:#c97fff;background:rgba(201,127,255,0.12)}

/* ── Chat messages (floating overlay) ── */
#chat-overlay{position:fixed;bottom:80px;left:16px;right:16px;z-index:5;pointer-events:none;display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto}
#chat-overlay::-webkit-scrollbar{width:3px}
#chat-overlay::-webkit-scrollbar-thumb{background:#2a2a50;border-radius:2px}
.chat-bubble{pointer-events:auto;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;word-break:break-word;animation:bubbleIn .25s ease-out;max-width:600px;width:fit-content}
.chat-bubble.user{background:rgba(30,21,53,0.9);border:1px solid rgba(74,122,255,.25);align-self:flex-end;margin-left:auto;border-radius:12px 4px 12px 12px;color:#b0c0f0}
.chat-bubble.assistant{background:rgba(26,14,46,0.9);border:1px solid rgba(201,127,255,.2);align-self:flex-start;border-radius:4px 12px 12px 12px}
.chat-bubble.system{background:rgba(15,15,30,0.7);border:1px solid #2a2a40;font-size:11px;color:#7a7aaa;text-align:center;margin:0 auto;border-radius:8px;padding:4px 10px;width:auto}
@keyframes bubbleIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
/* ── Bottom bar ── */
#bottom-bar{position:fixed;bottom:14px;left:14px;right:14px;z-index:10;display:flex;align-items:center;gap:8px;background:rgba(15,15,30,0.9);border:1px solid #2a2a40;border-radius:14px;padding:8px 10px;backdrop-filter:blur(12px);max-width:700px;margin:0 auto}
#bottom-bar input{flex:1;background:transparent;border:none;outline:none;color:#eee;font-size:14px;padding:6px 8px;font-family:system-ui,sans-serif}
#bottom-bar input::placeholder{color:#5a5a7a}
#bottom-bar button{width:36px;height:36px;border-radius:50%;border:1px solid #2a2a50;background:rgba(255,255,255,.04);color:#9a9aca;font-size:16px;cursor:pointer;transition:.2s;display:flex;align-items:center;justify-content:center;flex-shrink:0}
#bottom-bar button:hover{border-color:#c97fff;color:#c97fff;background:rgba(201,127,255,.1)}
#bottom-bar #send-btn{background:linear-gradient(135deg,#8b3ff5,#c97fff);border:none;color:#fff;font-size:15px}
#bottom-bar #send-btn:hover{box-shadow:0 0 16px rgba(139,63,245,.4)}
#bottom-bar #send-btn:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}

/* ── Settings modal ── */
#settings-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn .2s}
#settings-overlay.hidden{display:none}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
#settings-panel{background:#12101e;border:1px solid #2a2244;border-radius:18px;padding:24px 28px;width:min(440px,92vw);max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:slideUp .3s cubic-bezier(.34,1.56,.64,1)}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
#settings-panel h2{font-size:15px;color:#c97fff;margin-bottom:14px;letter-spacing:.5px}
#settings-panel::-webkit-scrollbar{width:4px}
#settings-panel::-webkit-scrollbar-thumb{background:#2a2244;border-radius:2px}
.st-group{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #1e1a30}
.st-group:last-child{border:none;margin:0;padding:0}
.st-group h3{font-size:11px;color:#6a5a8a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.st-btn{display:block;width:100%;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid #2a2244;color:#b0a0d0;font-size:13px;cursor:pointer;transition:.2s;text-align:center;margin-bottom:6px;font-family:system-ui,sans-serif}
.st-btn:hover{background:rgba(201,127,255,.1);border-color:#c97fff;color:#fff}
.st-btn:last-child{margin:0}
.st-btn.primary{background:linear-gradient(135deg,#6a1aaa,#c97fff);border:none;color:#fff;font-weight:600}
.st-btn.primary:hover{box-shadow:0 4px 20px rgba(201,127,255,.3)}
.key-row{display:flex;gap:6px;margin-bottom:6px;animation:fadeIn .2s}
.key-row input{flex:1;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid #2a2244;color:#e8dff5;font-family:monospace;font-size:12px;outline:none}
.key-row input:focus{border-color:#c97fff}
.key-row input::placeholder{color:#5a4a7a}
.key-row .rm-btn{width:30px;height:30px;border-radius:50%;border:1px solid #2a2244;background:transparent;color:#ff6b8a;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:.2s;flex-shrink:0}
.key-row .rm-btn:hover{background:rgba(255,107,138,.15);border-color:#ff6b8a}
.add-key-btn{display:flex;align-items:center;gap:6px;padding:8px;border-radius:8px;background:transparent;border:1px dashed #2a2244;color:#5a4a7a;font-size:12px;cursor:pointer;transition:.2s;width:100%;justify-content:center;margin-bottom:12px}
.add-key-btn:hover{border-color:#c97fff;color:#c97fff}
.tool-grid{display:flex;flex-wrap:wrap;gap:4px}
.tool-toggle{width:34px;height:34px;border-radius:8px;border:1px solid #2a2244;background:rgba(255,255,255,.03);color:#5a4a7a;font-size:15px;cursor:pointer;transition:.2s;display:flex;align-items:center;justify-content:center}
.tool-toggle.on{border-color:#c97fff;color:#c97fff;background:rgba(201,127,255,.1);box-shadow:0 0 8px rgba(201,127,255,.15)}
.tool-toggle:hover{border-color:#c97fff}
.cls-btn{display:block;width:100%;padding:10px;border-radius:10px;background:transparent;border:1px solid #2a2244;color:#6a5a8a;font-size:13px;cursor:pointer;transition:.2s;margin-top:8px;text-align:center}
.cls-btn:hover{border-color:#5a4a7a;color:#9a8aba}
#preset-grid{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.preset-btn{flex:1 0 calc(50% - 4px);padding:5px 6px;font-size:11px;background:#16162a;border:1px solid #2a2a50;border-radius:6px;color:#9a9aca;cursor:pointer;transition:.2s;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:system-ui,sans-serif}
.preset-btn:hover{background:#2a2a4e;border-color:#c97fff;color:#fff}
</style>
</head>
<body>

<div id="canvas"></div>

<div id="top-bar">
  <span class="model-status" id="modelStatus"><span class="ws-dot" id="wsDot"></span><span id="wsLabel">Python Link Offline</span></span>
  <button class="gear-btn" id="gearBtn" title="Settings">⚙</button>
</div>

<div id="chat-overlay"></div>

<div id="bottom-bar">
  <button id="micBtn" title="Voice input (coming soon)">🎤</button>
  <input id="inputBox" type="text" placeholder="Message Riko..." autocomplete="off">
  <button id="sendBtn" title="Send">➤</button>
</div>

<div id="settings-overlay" class="hidden">
  <div id="settings-panel">
    <h2>⚙ Settings</h2>

    <div class="st-group">
      <h3>🔑 API Keys</h3>
      <div id="keys-list"></div>
      <button class="add-key-btn" id="addKeyBtn">＋ Add API key</button>
      <button class="st-btn primary" id="applyKeysBtn">Save &amp; Connect</button>
    </div>

    <div class="st-group">
      <h3>🛠 Tools</h3>
      <div class="tool-grid" id="toolGrid"></div>
    </div>

    <div class="st-group">
      <h3>📂 VRM Model</h3>
      <button class="st-btn" id="loadVrmBtn">📂 Load VRM Model</button>
      <input id="vrmInput" type="file" accept=".vrm" hidden>
      <div style="font-size:11px;color:#6a5a8a;margin-top:4px" id="vrmStatus">No model loaded</div>
    </div>

    <div class="st-group">
      <h3>🏃 Animations</h3>
      <button class="st-btn" id="loadFbxBtn">🏃 Load FBX File</button>
      <input id="fbxInput" type="file" accept=".fbx" hidden>
      <div style="display:flex;gap:6px;margin-top:6px">
        <select id="animSelect" style="flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid #2a2244;color:#e8dff5;font-size:12px;outline:none;font-family:system-ui,sans-serif"></select>
        <button class="st-btn" id="loadAnimBtn" style="flex:0 0 auto;padding:8px 14px;width:auto">▶ Play</button>
      </div>
      <div style="font-size:11px;color:#6a5a8a;margin-top:4px" id="animStatus">No animation loaded</div>
    </div>

    <button class="cls-btn" id="closeSettings">Close</button>
  </div>
</div>

<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
    "@pixiv/three-vrm": "https://unpkg.com/@pixiv/three-vrm@2.1.3/lib/three-vrm.module.js"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/* ══════════════════════════════════════════
   VRM STATE
   ══════════════════════════════════════════ */
let currentVrm = null, scene, camera, renderer, controls;
let ws = null;
const clock = new THREE.Clock();
const targetBones = {}, targetExprs = {};
const STREAM_SMOOTH_SPEED = 7.0;
let catalogMixer = null, catalogRoot = null;
let pendingVrmRestCapture = false, vrmBaseHipsY = 0.9;
let mixamoRestLocal = {}, mixamoRestPositions = {};
let vrmRestLocal = {}, vrmBoneLookup = {};
let mixamoWorldRest = {}, vrmWorldRest = {};
let vrmFingerLookup = {}, vrmFingerRest = {}, vrmFingerWorldRest = {};
let mixamoFingerRestLocal = {}, mixamoFingerWorldRest = {};
let mixamoFingerMap = {}, mixamoFingerComposeMap = {};

const mixamoToVrmMap = {
  'mixamorigHips':'hips','mixamorigSpine':'spine','mixamorigSpine1':'chest','mixamorigSpine2':'upperChest',
  'mixamorigNeck':'neck','mixamorigHead':'head','mixamorigLeftShoulder':'leftShoulder',
  'mixamorigLeftArm':'leftUpperArm','mixamorigLeftForeArm':'leftLowerArm','mixamorigLeftHand':'leftHand',
  'mixamorigRightShoulder':'rightShoulder','mixamorigRightArm':'rightUpperArm','mixamorigRightForeArm':'rightLowerArm',
  'mixamorigRightHand':'rightHand','mixamorigLeftUpLeg':'leftUpperLeg','mixamorigLeftLeg':'leftLowerLeg',
  'mixamorigLeftFoot':'leftFoot','mixamorigLeftToeBase':'leftToes',
  'mixamorigRightUpLeg':'rightUpperLeg','mixamorigRightLeg':'rightLowerLeg',
  'mixamorigRightFoot':'rightFoot','mixamorigRightToeBase':'rightToes',
};

const ALL_FINGER_NAMES = [
  'leftThumbMetacarpal','leftThumbProximal','leftThumbDistal',
  'rightThumbMetacarpal','rightThumbProximal','rightThumbDistal',
  'leftIndexProximal','leftIndexIntermediate','leftIndexDistal',
  'rightIndexProximal','rightIndexIntermediate','rightIndexDistal',
  'leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal',
  'rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal',
  'leftRingProximal','leftRingIntermediate','leftRingDistal',
  'rightRingProximal','rightRingIntermediate','rightRingDistal',
  'leftLittleProximal','leftLittleIntermediate','leftLittleDistal',
  'rightLittleProximal','rightLittleIntermediate','rightLittleDistal',
];

/* ══════════════════════════════════════════
   VRM FUNCTIONS
   ══════════════════════════════════════════ */
function captureVrmRestData() {
  pendingVrmRestCapture = false;
  if (!currentVrm) return;
  try {
    currentVrm.update(0);
    currentVrm.scene.updateWorldMatrix(true, true);
    const hb = currentVrm.humanoid.getNormalizedBoneNode('hips');
    if (hb) vrmBaseHipsY = hb.position.y;
    vrmBoneLookup = {}; vrmRestLocal = {};
    for (const vn of Object.values(mixamoToVrmMap)) {
      const nb = currentVrm.humanoid.getNormalizedBoneNode(vn);
      if (!nb) continue; const k = vn.toLowerCase(); vrmBoneLookup[k] = nb; vrmRestLocal[k] = nb.quaternion.clone();
    }
    vrmWorldRest = {};
    for (const [mn, vn] of Object.entries(mixamoToVrmMap)) {
      const b = vrmBoneLookup[vn.toLowerCase()];
      if (b) { const q = new THREE.Quaternion(); b.getWorldQuaternion(q); vrmWorldRest[mn] = q; }
    }
    vrmFingerLookup = {}; vrmFingerRest = {}; vrmFingerWorldRest = {};
    for (const fn of ALL_FINGER_NAMES) {
      const nb = currentVrm.humanoid.getNormalizedBoneNode(fn);
      if (!nb) continue; const k = fn.toLowerCase(); vrmFingerLookup[k] = nb; vrmFingerRest[k] = nb.quaternion.clone();
      const q = new THREE.Quaternion(); nb.getWorldQuaternion(q); vrmFingerWorldRest[k] = q;
    }
    rebuildFingerMap();
    document.getElementById('vrmStatus').textContent = 'Model ready ✓';
  } catch (err) { console.error('[vrm] capture error:', err); }
}

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));

const DEF = { happy:.3,surprised:.15 }, D0 = { happy:0,angry:0,sad:0,relaxed:0,surprised:0,aa:0,ih:0,ou:0,ee:0,oh:0,blinkLeft:0,blinkRight:0 };
const ANIM_EXPR = {
  'Acknowledging.fbx':DEF,'Bored.fbx':{relaxed:.4,surprised:.1},'Crazy Gesture.fbx':{surprised:.6,happy:.15},
  'Crying.fbx':{sad:.5,aa:.3,surprised:.2},'Dismissing Gesture.fbx':{surprised:.25},'Happy Hand Gesture.fbx':{},
  'Happy.fbx':{happy:.45,surprised:.2,aa:.1},'Hip Hop Dancing.fbx':{happy:.5,surprised:.3},
  'Punching.fbx':{angry:.4,surprised:.2,aa:.15},'Relieved Sigh.fbx':{relaxed:.5,surprised:.1},
  'Standing Greeting.fbx':{happy:.3,surprised:.25},'Standing Idle.fbx':{relaxed:.2,surprised:.1},
  'Talking.fbx':{},'Threatening.fbx':{angry:.4,surprised:.3},'Happy Idle.fbx':{happy:.2,surprised:.5,aa:.2},
  'Clapping.fbx':{happy:.4,surprised:.3},'Look Around.fbx':{surprised:.4},'Sad Idle.fbx':{sad:.25,surprised:.15},
};
function loadVrm(url) {
  document.getElementById('vrmStatus').textContent = 'Loading...';
  if (currentVrm) { scene.remove(currentVrm.scene); VRMUtils.deepDispose(currentVrm.scene); }
  currentVrm = null; pendingVrmRestCapture = false; vrmBoneLookup = {}; vrmFingerLookup = {};
  loader.loadAsync(url).then(gltf => {
    currentVrm = gltf.userData.vrm;
    VRMUtils.rotateVRM0(currentVrm);
    scene.add(currentVrm.scene);
    let ver = 'VRM0';
    try { const sv = currentVrm.meta?.specVersion ?? currentVrm.meta?.metaVersion; if (sv) ver = 'VRM'+sv; } catch(_) {}
    document.getElementById('vrmStatus').textContent = `\u2705 ${url.split('/').pop()} (${ver})`;
    pendingVrmRestCapture = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'vrm_loaded'}));
  }).catch(err => { document.getElementById('vrmStatus').textContent = '\u274c Load failed'; console.error(err); });
}

function loadFbx(buf, name) {
  document.getElementById('animStatus').textContent = 'Loading...';
  for (const k of Object.keys(targetExprs)) delete targetExprs[k];
  try {
    const fbx = new FBXLoader().parse(buf, '');
    if (!fbx.animations?.length) { document.getElementById('animStatus').textContent = '\u274c No animation tracks'; return; }
    catalogRoot = fbx; mixamoRestLocal = {}; mixamoRestPositions = {};
    const clip = fbx.animations[0], tc = {};
    for (const t of clip.tracks) tc[t.name] = t;
    for (const mn of Object.keys(mixamoToVrmMap)) {
      const bone = fbx.getObjectByName(mn);
      if (!bone) continue;
      const qt = tc[mn+'.quaternion'];
      mixamoRestLocal[mn] = qt ? new THREE.Quaternion(qt.values[0],qt.values[1],qt.values[2],qt.values[3]) : bone.quaternion.clone();
      const pt = tc[mn+'.position'];
      mixamoRestPositions[mn] = pt ? new THREE.Vector3(pt.values[0],pt.values[1],pt.values[2]) : bone.position.clone();
    }
    mixamoFingerRestLocal = {};
    for (const hn of ['mixamorigLeftHand','mixamorigRightHand']) {
      const ho = fbx.getObjectByName(hn); if (!ho) continue;
      ho.traverse(c => { if (!c.isBone||c===ho) return; if (!/mixamorig(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky|Little)\d+$/i.test(c.name)) return; const qt=tc[c.name+'.quaternion']; mixamoFingerRestLocal[c.name]=qt?new THREE.Quaternion(qt.values[0],qt.values[1],qt.values[2],qt.values[3]):c.quaternion.clone(); });
    }
    catalogMixer = new THREE.AnimationMixer(catalogRoot);
    const action = catalogMixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;
    action.play();
    catalogMixer.addEventListener('finished', () => {
      setTimeout(() => {
        catalogMixer = null;
        catalogRoot = null;
        mixamoRestLocal = {};
        mixamoRestPositions = {};
        mixamoFingerRestLocal = {};
        mixamoWorldRest = {};
        mixamoFingerWorldRest = {};
        mixamoFingerMap = {};
        mixamoFingerComposeMap = {};
        for (const k of Object.keys(targetExprs)) delete targetExprs[k];
        document.getElementById('animStatus').textContent = 'Idle';
      }, 300);
    });
    fbx.updateWorldMatrix(true, true);
    mixamoWorldRest = {};
    for (const mn of Object.keys(mixamoToVrmMap)) { const b=fbx.getObjectByName(mn); if(b){const q=new THREE.Quaternion();b.getWorldQuaternion(q);mixamoWorldRest[mn]=q;} }
    mixamoFingerWorldRest = {};
    for (const hn of ['mixamorigLeftHand','mixamorigRightHand']) { const ho=fbx.getObjectByName(hn); if(!ho)continue; ho.traverse(c=>{if(!c.isBone||c===ho)return;if(!/mixamorig(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky|Little)\d+$/i.test(c.name))return;const q=new THREE.Quaternion();c.getWorldQuaternion(q);mixamoFingerWorldRest[c.name]=q;}); }
    if (currentVrm) rebuildFingerMap();
    for (const s of Object.keys(D0)) targetExprs[s] = 0;
    const ep = ANIM_EXPR[name]; if (ep) Object.assign(targetExprs, ep);
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'animation_loaded',name,expressions:ep||{}}));
    document.getElementById('animStatus').textContent = '\u{1F3C3} Active: '+name;
  } catch(err) { document.getElementById('animStatus').textContent = '\u274c Parse error'; console.error(err); }
}

function rebuildFingerMap() {
  if (!catalogRoot) return;
  const f2v = {thumb:[['leftThumbMetacarpal','leftThumbProximal','leftThumbDistal'],['rightThumbMetacarpal','rightThumbProximal','rightThumbDistal']],index:[['leftIndexProximal','leftIndexIntermediate','leftIndexDistal'],['rightIndexProximal','rightIndexIntermediate','rightIndexDistal']],middle:[['leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal'],['rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal']],ring:[['leftRingProximal','leftRingIntermediate','leftRingDistal'],['rightRingProximal','rightRingIntermediate','rightRingDistal']],little:[['leftLittleProximal','leftLittleIntermediate','leftLittleDistal'],['rightLittleProximal','rightLittleIntermediate','rightLittleDistal']],pinky:[['leftLittleProximal','leftLittleIntermediate','leftLittleDistal'],['rightLittleProximal','rightLittleIntermediate','rightLittleDistal']]};
  mixamoFingerMap = {}; mixamoFingerComposeMap = {};
  for (const hn of ['mixamorigLeftHand','mixamorigRightHand']) {
    const ho = catalogRoot.getObjectByName(hn); if (!ho) continue;
    ho.traverse(c => {
      if (!c.isBone||c===ho) return;
      const m = c.name.match(/mixamorig(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky|Little)(\d+)$/i);
      if (!m) return;
      const side=m[1],finger=m[2].toLowerCase(),bi=parseInt(m[3])-1;
      const roles=f2v[finger]; if(!roles)return;
      const si=side==='Right'?1:0,vc=roles[si]; if(bi>=vc.length)return;
      let vn=vc[bi],compose=false;
      if (!vrmFingerLookup[vn.toLowerCase()]) { let found=false; for(let fi=bi-1;fi>=0;fi--){const cnd=vc[fi];if(cnd&&vrmFingerLookup[cnd.toLowerCase()]){vn=cnd;compose=true;found=true;break}} if(!found)return; }
      if (compose) mixamoFingerComposeMap[c.name]=vn; else mixamoFingerMap[c.name]=vn;
    });
  }
}

function connectWS() {
  ws = new WebSocket('ws://'+window.location.hostname+':8766');
  ws.onopen = () => { document.getElementById('wsDot').classList.add('on'); document.getElementById('wsLabel').textContent = 'Python Link Active'; };
  ws.onclose = () => { document.getElementById('wsDot').classList.remove('on'); document.getElementById('wsLabel').textContent = 'Python Link Offline'; setTimeout(connectWS,4000); };
  ws.onerror = () => {};
  ws.onmessage = ev => {
    let msg; try{msg=JSON.parse(ev.data)}catch(_){return}
     if (msg.type==='expr') for(const[n,v]of Object.entries(msg.shapes)) targetExprs[n.toLowerCase()]=v;
     if (msg.type==='bone'&&!catalogMixer) targetBones[msg.name]={rx:msg.rx??0,ry:msg.ry??0,rz:msg.rz??0};
     if (msg.type==='play_animation'&&msg.data){(async()=>{const r=await fetch('data:application/octet-binary;base64,'+msg.data);loadFbx(await r.arrayBuffer(),msg.name)})()}
  };
}
connectWS();

const DEG=Math.PI/180, FBX2M=0.01;

function updateBonesAndExpressions(dt) {
  const step=Math.min(dt*STREAM_SMOOTH_SPEED,1);
  if (pendingVrmRestCapture&&currentVrm) { captureVrmRestData(); return; }
  if (currentVrm?.expressionManager) {
    const em=currentVrm.expressionManager, remap={joy:'happy',sorrow:'sad',fun:'relaxed',blinkleft:'blinkLeft',blinkright:'blinkRight'};
    for (const[n,tv]of Object.entries(targetExprs)) { const k=remap[n]||n; try{em.setValue(k,(em.getValue(k)||0)+(tv-(em.getValue(k)||0))*step)}catch(_){} }
  }
  if (catalogMixer&&catalogRoot&&currentVrm) {
    catalogMixer.update(dt); catalogRoot.updateWorldMatrix(true,true); currentVrm.scene.updateWorldMatrix(true,true);
    const tq=new THREE.Quaternion(),tq2=new THREE.Quaternion();
    for (const[mn,vn]of Object.entries(mixamoToVrmMap)) {
      const sb=catalogRoot.getObjectByName(mn),db=vrmBoneLookup[vn.toLowerCase()],mw=mixamoWorldRest[mn],vw=vrmWorldRest[mn];
      if (!sb||!db||!mw||!vw) continue;
      sb.getWorldQuaternion(tq); tq.multiply(tq2.copy(mw).invert());
      if (Math.abs(tq.w-1)<1e-6&&Math.abs(tq.x)<1e-6&&Math.abs(tq.y)<1e-6&&Math.abs(tq.z)<1e-6) { const rl=vrmRestLocal[vn.toLowerCase()]; if(rl)db.quaternion.copy(rl); db.updateMatrix(); continue; }
      tq.multiply(vw); const p=db.parent;
      if (p) { p.getWorldQuaternion(tq2); db.quaternion.copy(tq2.invert().multiply(tq)); } else db.quaternion.copy(tq);
      db.updateMatrix();
    }
    if (Object.keys(mixamoFingerMap).length>0) {
      for (const[mn,vn]of Object.entries(mixamoFingerMap)) { const sb=catalogRoot.getObjectByName(mn),db=vrmFingerLookup[vn.toLowerCase()],mw=mixamoFingerWorldRest[mn],vw=vrmFingerWorldRest[vn.toLowerCase()]; if(!sb||!db||!mw||!vw)continue; sb.getWorldQuaternion(tq); tq.multiply(tq2.copy(mw).invert()); tq.multiply(vw); const p=db.parent; if(p){p.getWorldQuaternion(tq2);db.quaternion.copy(tq2.invert().multiply(tq))}else db.quaternion.copy(tq); db.updateMatrix(); }
      for (const[mn,vn]of Object.entries(mixamoFingerComposeMap)) { const sb=catalogRoot.getObjectByName(mn),db=vrmFingerLookup[vn.toLowerCase()],mr=mixamoFingerRestLocal[mn]; if(!sb||!db||!mr)continue; tq.copy(mr).invert().multiply(sb.quaternion); db.quaternion.multiply(tq); db.updateMatrix(); }
    }
    const sh=catalogRoot.getObjectByName('mixamorigHips'),dh=vrmBoneLookup['hips'];
    if (sh&&dh) { const rp=mixamoRestPositions['mixamorigHips']??new THREE.Vector3(),diff=new THREE.Vector3().subVectors(sh.position,rp); dh.position.set(diff.x*FBX2M,vrmBaseHipsY+diff.y*FBX2M,diff.z*FBX2M); }
  } else if (currentVrm?.humanoid) {
    for (const[bn,rot]of Object.entries(targetBones)) { const b=currentVrm.humanoid.getNormalizedBoneNode(bn); if(b)b.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.rx*DEG,rot.ry*DEG,rot.rz*DEG)),step); }
  }
}

scene=new THREE.Scene();
camera=new THREE.PerspectiveCamera(25,window.innerWidth/window.innerHeight,.1,50);
camera.position.set(0,1.2,3.5);
scene.add(new THREE.AmbientLight(0xffffff,.4));
const kl=new THREE.DirectionalLight(0xffffff,1);kl.position.set(2,3,3);scene.add(kl);
const fl=new THREE.DirectionalLight(0xaaccff,.4);fl.position.set(-2,1,2);scene.add(fl);
const rm=new THREE.DirectionalLight(0xffffff,.3);rm.position.set(0,1,-3);scene.add(rm);
scene.add(new THREE.GridHelper(10,20,0x222235,0x181825));
renderer=new THREE.WebGLRenderer({antialias:true});
document.getElementById('canvas').appendChild(renderer.domElement);
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1;
controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,1,0);
controls.update();
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)});
(function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.1);updateBonesAndExpressions(dt);if(currentVrm)currentVrm.update(dt);controls.update();renderer.render(scene,camera)})();

/* Auto-load riko.vrm */
loadVrm('waifuModels/riko.vrm');

/* ══════════════════════════════════════════
   UI: SETTINGS MODAL
   ══════════════════════════════════════════ */
const TOOLS_LIST = [
  {id:'get_current_time',icon:'\u{1F550}',label:'Time'},{id:'webfetch',icon:'\u{1F310}',label:'Web'},
  {id:'run_command',icon:'\u26A1',label:'Cmd'},{id:'winutils',icon:'\u{1F9FF}',label:'Win'},
  {id:'system_info',icon:'\u{1F4BB}',label:'Sys'},{id:'clipboard',icon:'\u{1F4CB}',label:'Clip'},
  {id:'calculator',icon:'\u{1F522}',label:'Calc'},{id:'shutdown',icon:'\u23F0',label:'Off'},
];
let toolState = {};
for (const t of TOOLS_LIST) toolState[t.id] = true;

const gearBtn=document.getElementById('gearBtn');
const settingsOverlay=document.getElementById('settings-overlay');
const closeSettings=document.getElementById('closeSettings');
gearBtn.onclick=()=>{settingsOverlay.classList.remove('hidden');buildSettingsPanel();};
closeSettings.onclick=()=>settingsOverlay.classList.add('hidden');
settingsOverlay.onclick=e=>{if(e.target===settingsOverlay)settingsOverlay.classList.add('hidden')};

function buildSettingsPanel() {
  /* keys */
  const kl=document.getElementById('keys-list'); kl.innerHTML='';
  const addRow=(val='')=>{const r=document.createElement('div');r.className='key-row';r.innerHTML='<input type="password" placeholder="gsk_..." spellcheck="false" value="'+val.replace(/"/g,'&quot;')+'"><button class="rm-btn" onclick="this.parentElement.remove()">\u2715</button>';kl.appendChild(r)};
  addRow();
  document.getElementById('addKeyBtn').onclick=()=>addRow();

  /* tools */
  const tg=document.getElementById('toolGrid'); tg.innerHTML='';
  for (const t of TOOLS_LIST) {
    const btn=document.createElement('button');btn.className='tool-toggle'+(toolState[t.id]?' on':'');btn.textContent=t.icon;
    btn.title=t.label;
    btn.onclick=()=>{toolState[t.id]=!toolState[t.id];btn.className='tool-toggle'+(toolState[t.id]?' on':'');fetch('/api/tools',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({[t.id]:toolState[t.id]})})};
    tg.appendChild(btn);
  }

  /* VRM load */
  document.getElementById('loadVrmBtn').onclick=()=>document.getElementById('vrmInput').click();

  /* FBX load */
  document.getElementById('loadFbxBtn').onclick=()=>document.getElementById('fbxInput').click();

  /* presets — populate dropdown from server */
  const sel=document.getElementById('animSelect');
  fetch('/api/animations').then(r=>r.json()).then(list=>{
    sel.innerHTML='<option value="">— Select animation —</option>'+list.map(f=>'<option value="'+f+'">'+f.replace('.fbx','')+'</option>').join('');
  }).catch(()=>{
    sel.innerHTML='<option value="">— No animations available —</option>';
  });
  document.getElementById('loadAnimBtn').onclick=async()=>{
    const fn=sel.value; if(!fn)return;
    const btn=document.getElementById('loadAnimBtn'); btn.textContent='↻';
    try{const r=await fetch('animPresets/'+encodeURIComponent(fn));if(!r.ok)throw Error('HTTP '+r.status);const b=await r.arrayBuffer();loadFbx(b,fn);document.getElementById('animStatus').textContent='🏃 '+fn.replace('.fbx','')}catch(err){document.getElementById('animStatus').textContent='❌ Failed';console.error(err)}
    btn.textContent='▶ Play';
  };
}

/* VRM file input */
document.getElementById('vrmInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const url=URL.createObjectURL(f);loadVrm(url);URL.revokeObjectURL(url);e.target.value=''};

/* FBX file input */
document.getElementById('fbxInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>loadFbx(ev.target.result,f.name);r.readAsArrayBuffer(f);e.target.value=''};

/* Apply keys */
document.getElementById('applyKeysBtn').onclick=async()=>{
  const inputs=document.querySelectorAll('#keys-list input'); const keys=Array.from(inputs).map(i=>i.value.trim()).filter(Boolean);
  if (!keys.length) return;
  try{const r=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys})});const d=await r.json();if(d.ok){settingsOverlay.classList.add('hidden');addChatMsg('system','\u{1F511} API keys connected! Riko is ready~')}}catch(e){alert('Could not connect to server.')}
};

/* ══════════════════════════════════════════
   UI: CHAT
   ══════════════════════════════════════════ */
const chatOverlay=document.getElementById('chat-overlay');
const inputBox=document.getElementById('inputBox');
const sendBtn=document.getElementById('sendBtn');
let isChatting=false;

function addChatMsg(role,text) {
  const el=document.createElement('div');el.className='chat-bubble '+role;el.textContent=text;chatOverlay.appendChild(el);
  chatOverlay.scrollTop=chatOverlay.scrollHeight;
  if (chatOverlay.children.length>80) chatOverlay.removeChild(chatOverlay.children[0]);
}

async function sendChat() {
  const text=inputBox.value.trim(); if(!text||isChatting)return;
  inputBox.value=''; addChatMsg('user',text);
  isChatting=true; sendBtn.disabled=true;
  try {
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
    const d=await r.json();
    if (d.reply) addChatMsg('assistant',d.reply);
    else if (d.error==='not_setup') addChatMsg('system','\u26A0 No API keys set. Open settings and add keys first!');
    else if (d.error==='all_exhausted') addChatMsg('assistant',d.reply);
    else if (d.error) addChatMsg('system','\u274c Error: '+(d.message||d.error));
  } catch(e) { addChatMsg('system','\u274c Server unreachable'); }
  isChatting=false; sendBtn.disabled=false; inputBox.focus();
}

sendBtn.onclick=sendChat;
inputBox.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()});

/* Load tool state */
fetch('/api/tools').then(r=>r.json()).then(d=>{for(const[k,v]of Object.entries(d))if(k in toolState)toolState[k]=v}).catch(()=>{});
</script>
</body>
</html>
"""

RIKO_CHAT_HTML = r"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Riko ✦ Kitsune Chat</title>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;700&family=Sawarabi+Mincho&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0d0a12; --bg2: #120e1c; --bg3: #1a1428; --panel: #16112200;
    --border: #2e2244; --border2: #3d2f5a;
    --accent: #c97fff; --accent2: #ff7eb3; --accent3: #7eb8ff; --gold: #ffd97a;
    --text: #e8dff5; --muted: #8a7aaa;
    --user-bg: #1e1535; --riko-bg: #1a0e2e;
    --riko-glow: rgba(201,127,255,0.15);
    --danger: #ff6b8a; --success: #7affc8;
    --radius: 16px; --radius-sm: 8px;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: 'Zen Kaku Gothic New', sans-serif; overflow: hidden; }
  body::before {
    content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    opacity: 0.5;
  }
  .aurora { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
  .aurora span { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.12; animation: drift 18s ease-in-out infinite alternate; }
  .aurora span:nth-child(1) { width: 600px; height: 400px; background: #8b3ff5; top: -10%; left: -10%; animation-duration: 20s; }
  .aurora span:nth-child(2) { width: 500px; height: 500px; background: #ff4fa3; top: 30%; right: -15%; animation-duration: 25s; animation-delay: -5s; }
  .aurora span:nth-child(3) { width: 400px; height: 300px; background: #4fa3ff; bottom: -5%; left: 20%; animation-duration: 22s; animation-delay: -10s; }
  .aurora span:nth-child(4) { width: 300px; height: 300px; background: #ffd97a; top: 60%; left: 40%; animation-duration: 30s; animation-delay: -8s; }
  @keyframes drift { from { transform: translate(0,0) scale(1); } to { transform: translate(40px, 30px) scale(1.1); } }
  #app { position: relative; z-index: 1; display: grid; grid-template-rows: auto 1fr auto; height: 100vh; max-width: 900px; margin: 0 auto; padding: 0 12px; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 0 14px; border-bottom: 1px solid var(--border); }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .riko-avatar { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #6a1aaa, #c97fff, #ff7eb3); display: flex; align-items: center; justify-content: center; font-size: 26px; box-shadow: 0 0 20px rgba(201,127,255,0.4), 0 0 40px rgba(201,127,255,0.15); flex-shrink: 0; animation: avatarPulse 3s ease-in-out infinite; }
  @keyframes avatarPulse { 0%,100% { box-shadow: 0 0 20px rgba(201,127,255,0.4), 0 0 40px rgba(201,127,255,0.15); } 50% { box-shadow: 0 0 30px rgba(201,127,255,0.6), 0 0 60px rgba(201,127,255,0.25); } }
  .riko-info { line-height: 1.3; }
  .riko-name { font-family: 'Sawarabi Mincho', serif; font-size: 1.35rem; font-weight: 700; background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 0.02em; }
  .riko-sub { font-size: 0.72rem; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; }
  .header-right { display: flex; align-items: center; gap: 10px; }
  .pill-btn { display: flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 40px; border: 1px solid var(--border2); background: rgba(255,255,255,0.04); color: var(--muted); font-size: 0.75rem; font-family: 'Space Mono', monospace; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
  .pill-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(201,127,255,0.08); }
  .pill-btn.danger:hover { border-color: var(--danger); color: var(--danger); background: rgba(255,107,138,0.08); }
  .tool-toggles { display: flex; align-items: center; gap: 2px; margin-right: 6px; }
  .toggle-wrap { position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid var(--border2); background: rgba(255,255,255,0.03); cursor: pointer; transition: all 0.2s; font-size: 0.85rem; }
  .toggle-wrap:hover { border-color: var(--accent); background: rgba(201,127,255,0.08); }
  .toggle-wrap input { position: absolute; opacity: 0; width: 0; height: 0; }
  .toggle-wrap .slider { opacity: 0.35; transition: all 0.25s; line-height: 1; }
  .toggle-wrap input:checked + .slider { opacity: 1; filter: drop-shadow(0 0 6px rgba(201,127,255,0.5)); }
  .toggle-tip { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 4px; padding: 2px 6px; border-radius: 4px; background: var(--bg3); color: var(--muted); font-size: 0.6rem; font-family: 'Space Mono', monospace; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; border: 1px solid var(--border); z-index: 10; }
  .toggle-wrap:hover .toggle-tip { opacity: 1; }
  #key-badge { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 40px; font-size: 0.72rem; font-family: 'Space Mono', monospace; background: rgba(122,255,200,0.08); border: 1px solid rgba(122,255,200,0.2); color: var(--success); }
  #key-badge.warn { background: rgba(255,217,122,0.08); border-color: rgba(255,217,122,0.25); color: var(--gold); }
  #key-badge.error { background: rgba(255,107,138,0.08); border-color: rgba(255,107,138,0.25); color: var(--danger); }
  #key-badge.hidden { display: none; }
  #setup-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(13,10,18,0.92); backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.4s; }
  #setup-overlay.hidden { display: none; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .setup-card { background: var(--bg2); border: 1px solid var(--border2); border-radius: 20px; padding: 36px 40px; width: min(520px, 95vw); box-shadow: 0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(201,127,255,0.1); animation: slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .setup-card h2 { font-family: 'Sawarabi Mincho', serif; font-size: 1.6rem; background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 6px; }
  .setup-card p { color: var(--muted); font-size: 0.85rem; margin-bottom: 24px; line-height: 1.6; }
  #keys-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .key-row { display: flex; gap: 8px; align-items: center; animation: fadeIn 0.25s; }
  .key-row input { flex: 1; padding: 11px 14px; border-radius: var(--radius-sm); background: rgba(255,255,255,0.05); border: 1px solid var(--border2); color: var(--text); font-family: 'Space Mono', monospace; font-size: 0.8rem; outline: none; transition: border-color 0.2s; }
  .key-row input:focus { border-color: var(--accent); }
  .key-row input::placeholder { color: var(--muted); }
  .icon-btn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border2); background: rgba(255,255,255,0.04); color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; transition: all 0.2s; flex-shrink: 0; }
  .icon-btn:hover { border-color: var(--accent2); color: var(--accent2); background: rgba(255,126,179,0.08); }
  .icon-btn.remove:hover { border-color: var(--danger); color: var(--danger); background: rgba(255,107,138,0.08); }
  #add-key-btn { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px; border-radius: var(--radius-sm); background: transparent; border: 1px dashed var(--border2); color: var(--muted); font-size: 0.82rem; cursor: pointer; transition: all 0.2s; margin-bottom: 20px; }
  #add-key-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(201,127,255,0.05); }
  .start-btn { width: 100%; padding: 14px; border-radius: var(--radius-sm); background: linear-gradient(135deg, #8b3ff5, #c97fff); border: none; color: white; font-size: 1rem; font-weight: 700; font-family: 'Zen Kaku Gothic New', sans-serif; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 20px rgba(139,63,245,0.4); letter-spacing: 0.04em; }
  .start-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(139,63,245,0.5); }
  .start-btn:active { transform: translateY(0); }
  #chat { overflow-y: auto; padding: 24px 0; display: flex; flex-direction: column; gap: 20px; scroll-behavior: smooth; }
  #chat::-webkit-scrollbar { width: 4px; }
  #chat::-webkit-scrollbar-track { background: transparent; }
  #chat::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }
  .msg { display: flex; gap: 12px; animation: msgIn 0.3s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes msgIn { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: none; } }
  .msg.user { flex-direction: row-reverse; }
  .msg-avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-top: 4px; }
  .msg.riko .msg-avatar { background: linear-gradient(135deg, #6a1aaa, #c97fff); box-shadow: 0 0 12px rgba(201,127,255,0.3); }
  .msg.user .msg-avatar { background: linear-gradient(135deg, #1a3a6a, #4a7aff); box-shadow: 0 0 12px rgba(74,122,255,0.3); }
  .msg-body { max-width: 74%; display: flex; flex-direction: column; gap: 4px; }
  .msg.user .msg-body { align-items: flex-end; }
  .msg-sender { font-size: 0.7rem; color: var(--muted); font-family: 'Space Mono', monospace; letter-spacing: 0.06em; }
  .msg-bubble { padding: 12px 16px; border-radius: 16px; font-size: 0.92rem; line-height: 1.65; word-break: break-word; }
  .msg.riko .msg-bubble { background: var(--riko-bg); border: 1px solid rgba(201,127,255,0.2); box-shadow: 0 2px 20px rgba(0,0,0,0.3), inset 0 0 30px rgba(201,127,255,0.04); border-radius: 4px 16px 16px 16px; }
  .msg.user .msg-bubble { background: var(--user-bg); border: 1px solid rgba(74,122,255,0.2); border-radius: 16px 4px 16px 16px; }
  .msg-image { max-width: 260px; max-height: 220px; border-radius: var(--radius-sm); object-fit: cover; margin-bottom: 6px; border: 1px solid var(--border2); cursor: pointer; transition: opacity 0.2s; }
  .msg-image:hover { opacity: 0.85; }
  .typing-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin: 0 2px; animation: typeBounce 1.2s ease-in-out infinite; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typeBounce { 0%,80%,100%{transform:scale(0.7);opacity:0.5} 40%{transform:scale(1.1);opacity:1} }
  .sys-msg { text-align: center; font-size: 0.72rem; color: var(--muted); font-family: 'Space Mono', monospace; padding: 4px 0; opacity: 0.7; }
  .tool-badge { display: inline-block; font-size: 0.6rem; font-family: 'Space Mono', monospace; background: rgba(201,127,255,0.15); border: 1px solid rgba(201,127,255,0.3); border-radius: 4px; padding: 1px 6px; margin: 0 4px 2px 0; color: #c97fff; vertical-align: middle; letter-spacing: 0.02em; }
  .tool-badge .detail { color: rgba(201,127,255,0.6); }
  .msg.user .tool-badge { background: rgba(74,122,255,0.15); border-color: rgba(74,122,255,0.3); color: #8ab0ff; }
  .msg.user .tool-badge .detail { color: rgba(74,122,255,0.6); }
  #shutdown-banner { display: none; margin: 0 0 8px 0; padding: 10px 16px; border-radius: var(--radius-sm); background: rgba(255,107,138,0.1); border: 1px solid rgba(255,107,138,0.35); font-family: 'Space Mono', monospace; font-size: 0.75rem; animation: fadeIn 0.3s; }
  #shutdown-banner.visible { display: block; }
  #shutdown-banner .sd-title { color: var(--danger); font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px; }
  #shutdown-banner .sd-msg { color: var(--text); opacity: 0.85; font-style: italic; }
  #shutdown-banner .sd-timer { color: var(--muted); font-size: 0.68rem; margin-top: 4px; }
  #input-wrap { padding: 14px 0 20px; border-top: 1px solid var(--border); }
  #image-previews { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  #image-previews:empty { display: none; }
  .img-preview-item { position: relative; width: 64px; height: 64px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border2); animation: fadeIn 0.2s; }
  .img-preview-item img { width: 100%; height: 100%; object-fit: cover; }
  .img-preview-item button { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(13,10,18,0.85); color: var(--danger); font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }
  #input-row { display: flex; gap: 10px; align-items: flex-end; }
  #input-box { flex: 1; padding: 13px 16px; border-radius: var(--radius); background: rgba(255,255,255,0.04); border: 1px solid var(--border2); color: var(--text); font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 0.92rem; resize: none; outline: none; transition: border-color 0.2s; min-height: 48px; max-height: 160px; line-height: 1.5; }
  #input-box:focus { border-color: var(--accent); background: rgba(201,127,255,0.04); }
  #input-box::placeholder { color: var(--muted); }
  .send-area { display: flex; flex-direction: column; gap: 8px; align-items: center; }
  #img-btn { width: 42px; height: 42px; border-radius: 50%; background: rgba(255,255,255,0.04); border: 1px solid var(--border2); color: var(--muted); font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  #img-btn:hover { border-color: var(--accent3); color: var(--accent3); background: rgba(126,184,255,0.08); }
  #send-btn { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #8b3ff5, #c97fff); border: none; color: white; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(139,63,245,0.4); transition: all 0.2s; }
  #send-btn:hover { transform: scale(1.08); box-shadow: 0 6px 22px rgba(139,63,245,0.5); }
  #send-btn:active { transform: scale(0.95); }
  #send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  #file-input { display: none; }
  #empty-state { text-align: center; margin: auto; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  #empty-state .big-emoji { font-size: 4rem; filter: drop-shadow(0 0 20px rgba(201,127,255,0.5)); }
  #empty-state p { color: var(--muted); font-size: 0.88rem; max-width: 320px; line-height: 1.6; }
  #empty-state .hint { font-family: 'Space Mono', monospace; font-size: 0.7rem; color: var(--muted); opacity: 0.6; padding: 6px 12px; border: 1px dashed var(--border2); border-radius: 40px; }
  #lightbox { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; cursor: zoom-out; animation: fadeIn 0.2s; }
  #lightbox.hidden { display: none; }
  #lightbox img { max-width: 90vw; max-height: 90vh; border-radius: var(--radius); }
</style>
</head>
<body>
<div class="aurora"><span></span><span></span><span></span><span></span></div>
<div id="setup-overlay">
  <div class="setup-card">
    <h2>🦊 Riko is waiting…</h2>
    <p>Enter your Groq API keys below. Riko will seamlessly rotate between them when one runs out of credits.</p>
    <div id="keys-list">
      <div class="key-row">
        <input type="password" placeholder="gsk_••••••••••••••••••••••••••" spellcheck="false" autocomplete="off">
        <button class="icon-btn remove" onclick="removeKeyRow(this)" title="Remove">✕</button>
      </div>
    </div>
    <button id="add-key-btn" onclick="addKeyRow()">＋ Add another API key</button>
    <button class="start-btn" onclick="setupKeys()">Enter the Den 🦊</button>
  </div>
</div>
<div id="app">
  <header>
    <div class="header-left">
      <div class="riko-avatar">🦊</div>
      <div class="riko-info">
        <div class="riko-name">Riko</div>
        <div class="riko-sub">Kitsune AI · Llama 4 Scout</div>
      </div>
    </div>
    <div class="header-right">
      <div class="tool-toggles" id="tool-toggles">
        <label class="toggle-wrap" title="Current time/date">
          <input type="checkbox" data-tool="get_current_time" checked>
          <span class="slider">🕐</span><span class="toggle-tip">Time</span>
        </label>
        <label class="toggle-wrap" title="Web fetch">
          <input type="checkbox" data-tool="webfetch" checked>
          <span class="slider">🌐</span><span class="toggle-tip">Fetch</span>
        </label>
        <label class="toggle-wrap" title="Run commands">
          <input type="checkbox" data-tool="run_command" checked>
          <span class="slider">⚡</span><span class="toggle-tip">Cmd</span>
        </label>
        <label class="toggle-wrap" title="Windows utilities">
          <input type="checkbox" data-tool="winutils" checked>
          <span class="slider">🪟</span><span class="toggle-tip">Win</span>
        </label>
        <label class="toggle-wrap" title="System info">
          <input type="checkbox" data-tool="system_info" checked>
          <span class="slider">💻</span><span class="toggle-tip">Sys</span>
        </label>
        <label class="toggle-wrap" title="Clipboard">
          <input type="checkbox" data-tool="clipboard" checked>
          <span class="slider">📋</span><span class="toggle-tip">Clip</span>
        </label>
        <label class="toggle-wrap" title="Calculator">
          <input type="checkbox" data-tool="calculator" checked>
          <span class="slider">🔢</span><span class="toggle-tip">Calc</span>
        </label>
      </div>
      <div id="key-badge" class="hidden"><span id="key-dot">●</span><span id="key-text">0/0 keys</span></div>
      <button class="pill-btn" onclick="openSetup()">🔑 Keys</button>
      <button class="pill-btn danger" onclick="clearChat()">🗑 Clear</button>
    </div>
  </header>
  <div id="chat">
    <div id="empty-state">
      <div class="big-emoji">🦊</div>
      <p>Hmph. You finally showed up. Say something — if you <em>dare</em>.</p>
      <div class="hint">You can also send images~</div>
    </div>
  </div>
  <div id="input-wrap">
    <div id="shutdown-banner">
      <div class="sd-title">⏻ You're about to be signed out</div>
      <div class="sd-msg" id="sd-msg-text"></div>
      <div class="sd-timer" id="sd-timer-text"></div>
    </div>
    <div id="image-previews"></div>
    <div id="input-row">
      <textarea id="input-box" placeholder="Say something to Riko…" rows="1"></textarea>
      <div class="send-area">
        <button id="img-btn" title="Attach image" onclick="document.getElementById('file-input').click()">🖼</button>
        <button id="send-btn" onclick="sendMessage()" title="Send">➤</button>
      </div>
    </div>
  </div>
</div>
<input type="file" id="file-input" accept="image/*" multiple>
<div id="lightbox" class="hidden" onclick="this.classList.add('hidden')"><img id="lightbox-img" src="" alt=""></div>
<script>
let pendingImages = [];
let isTyping = false;
function addKeyRow() {
  const list = document.getElementById('keys-list');
  const row = document.createElement('div');
  row.className = 'key-row';
  row.innerHTML = '<input type="password" placeholder="gsk_••••••••••••••••••••••••••" spellcheck="false" autocomplete="off"><button class="icon-btn remove" onclick="removeKeyRow(this)" title="Remove">✕</button>';
  list.appendChild(row);
  row.querySelector('input').focus();
}
function removeKeyRow(btn) {
  const rows = document.querySelectorAll('.key-row');
  if (rows.length <= 1) return;
  btn.closest('.key-row').remove();
}
async function setupKeys() {
  const inputs = document.querySelectorAll('.key-row input');
  const keys = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
  if (!keys.length) { alert('Add at least one API key!'); return; }
  try {
    const res = await fetch('/api/setup', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keys}) });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('setup-overlay').classList.add('hidden');
      updateKeyBadge(data.key_count, data.key_count);
      addSysMsg('\ud83d\udd11 ' + data.key_count + ' API key' + (data.key_count > 1 ? 's' : '') + ' loaded. Riko is ready~');
    }
  } catch (e) { alert('Could not connect to the server. Is main.py running?'); }
}
function openSetup() { document.getElementById('setup-overlay').classList.remove('hidden'); }
function updateKeyBadge(available, total) {
  const badge = document.getElementById('key-badge');
  const text = document.getElementById('key-text');
  badge.classList.remove('hidden', 'warn', 'error');
  text.textContent = available + '/' + total + ' keys';
  if (available === 0) badge.classList.add('error');
  else if (available <= 1) badge.classList.add('warn');
}
document.getElementById('file-input').addEventListener('change', e => { Array.from(e.target.files).forEach(readImageFile); e.target.value = ''; });
function readImageFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const b64 = ev.target.result.split(',')[1];
    const url = URL.createObjectURL(file);
    pendingImages.push({data: b64, mime: file.type, url});
    renderImagePreviews();
  };
  reader.readAsDataURL(file);
}
function renderImagePreviews() {
  const wrap = document.getElementById('image-previews');
  wrap.innerHTML = '';
  pendingImages.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'img-preview-item';
    item.innerHTML = '<img src="' + img.url + '"><button onclick="removeImage(' + i + ')">\u2715</button>';
    wrap.appendChild(item);
  });
}
function removeImage(i) { URL.revokeObjectURL(pendingImages[i].url); pendingImages.splice(i, 1); renderImagePreviews(); }
function addSysMsg(text) { const chat = document.getElementById('chat'); const el = document.createElement('div'); el.className = 'sys-msg'; el.textContent = text; chat.appendChild(el); scrollChat(); }
function addMessage(role, text, images, tools) {
  images = images || [];
  tools = tools || [];
  const chat = document.getElementById('chat');
  const empty = document.getElementById('empty-state');
  if (empty) empty.remove();
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  const avatarEmoji = role === 'riko' ? '\ud83e\udd8a' : '\ud83c\udfae';
  const senderName = role === 'riko' ? 'Riko' : 'Bilgin';
  let imagesHtml = images.map(url => '<img class="msg-image" src="' + url + '" alt="image" onclick="openLightbox(\'' + url + '\')">').join('');
  let toolsHtml = '';
  if (tools.length) {
    toolsHtml = tools.map(t => {
      const label = toolLabel(t.name);
      const detail = toolDetail(t.name, t.args || {});
      return '<span class="tool-badge">' + label + (detail ? ' <span class="detail">' + escHtml(detail) + '</span>' : '') + '</span>';
    }).join('');
  }
  wrap.innerHTML = '<div class="msg-avatar">' + avatarEmoji + '</div><div class="msg-body"><div class="msg-sender">' + senderName + '</div>' + imagesHtml + (text ? '<div class="msg-bubble">' + (toolsHtml ? toolsHtml : '') + escHtml(text) + '</div>' : '') + '</div>';
  chat.appendChild(wrap);
  scrollChat();
}
function toolLabel(name) {
  const map = { get_current_time: '\ud83d\udd50 Time', webfetch: '\ud83c\udf10 Web', run_command: '\u26a1 Cmd', winutils: '\ud83e\uddff WinUtils', shutdown: '\u23f0 Shutdown', system_info: '\ud83d\udcbb System', clipboard: '\ud83d\udccb Clipboard', calculator: '\ud83d\udd22 Calc', play_animation: '\ud83c\udfad Anim', write_file: '\ud83d\udcdd Write', read_file: '\ud83d\udcd6 Read', write_and_run: '\u25b6\ufe0f Run', open_file: '\ud83d\udcc2 Open', kill_process: '\u2620 Kill', known_paths: '\ud83d\udcc1 Paths' };
  return map[name] || name;
}
function toolDetail(name, args) {
  if (name === 'play_animation') return args.mood ? args.mood : (args.animation || '');
  if (name === 'webfetch') return args.search || args.url || '';
  if (name === 'run_command') return args.command || '';
  if (name === 'calculator') return args.expression || '';
  if (name === 'winutils') return args.action + (args.message ? ': ' + args.message : '') + (args.target ? ': ' + args.target : '');
  if (name === 'shutdown') return args.message || '';
  if (name === 'clipboard') return args.action || '';
  if (name === 'write_file' || name === 'write_and_run') return args.path || '';
  if (name === 'read_file') return args.path || '';
  if (name === 'open_file') return args.target || '';
  if (name === 'kill_process') return args.target || '';
  return JSON.stringify(args);
}
function addTypingIndicator() {
  const chat = document.getElementById('chat');
  const empty = document.getElementById('empty-state');
  if (empty) empty.remove();
  const wrap = document.createElement('div');
  wrap.className = 'msg riko';
  wrap.id = 'typing-indicator';
  wrap.innerHTML = '<div class="msg-avatar">\ud83e\udd8a</div><div class="msg-body"><div class="msg-sender">Riko</div><div class="msg-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>';
  chat.appendChild(wrap);
  scrollChat();
}
function removeTypingIndicator() { const el = document.getElementById('typing-indicator'); if (el) el.remove(); }
function scrollChat() { const chat = document.getElementById('chat'); chat.scrollTop = chat.scrollHeight; }
async function sendMessage() {
  if (isTyping) return;
  const inputBox = document.getElementById('input-box');
  const text = inputBox.value.trim();
  const images = [...pendingImages];
  if (!text && !images.length) return;
  const imageUrls = images.map(i => i.url);
  addMessage('user', text, imageUrls);
  inputBox.value = '';
  autoResize(inputBox);
  pendingImages = [];
  renderImagePreviews();
  isTyping = true;
  document.getElementById('send-btn').disabled = true;
  addTypingIndicator();
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, images: images.map(i => ({data: i.data, mime: i.mime}))}) });
    const data = await res.json();
    removeTypingIndicator();
    if (data.key_status) { updateKeyBadge(data.key_status.available_count, data.key_status.total); if (data.rotated) addSysMsg('\ud83d\udd11 Switched to key #' + (data.key_status.active_index + 1)); }
    if (data.error === 'not_setup') addSysMsg('\u26a0\ufe0f No API keys set up yet. Click "Keys" to add them!');
    else if (data.error === 'all_exhausted') addMessage('riko', data.reply, [], data.tools_used || []);
    else if (data.reply) addMessage('riko', data.reply, [], data.tools_used || []);
    else if (data.error) addSysMsg('\u274c Error: ' + (data.message || data.error));
  } catch (e) { removeTypingIndicator(); addSysMsg('\u274c Could not reach the server. Is main.py running?'); }
  isTyping = false;
  document.getElementById('send-btn').disabled = false;
  inputBox.focus();
}
async function clearChat() {
  if (!confirm('Clear the entire conversation?')) return;
  await fetch('/api/history', {method: 'DELETE'});
  document.getElementById('chat').innerHTML = '<div id="empty-state"><div class="big-emoji">\ud83e\udd8a</div><p>Hmph. You finally showed up. Say something \u2014 if you <em>dare</em>.</p><div class="hint">You can also send images~</div></div>';
}
function openLightbox(src) { document.getElementById('lightbox-img').src = src; document.getElementById('lightbox').classList.remove('hidden'); }
const inputBox = document.getElementById('input-box');
inputBox.addEventListener('input', () => autoResize(inputBox));
inputBox.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(readImageFile); });
document.addEventListener('paste', e => { Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/')).forEach(readImageFile); });
async function loadToolState() { try { const res = await fetch('/api/tools'); const data = await res.json(); document.querySelectorAll('#tool-toggles input').forEach(cb => { const tool = cb.dataset.tool; if (tool in data) cb.checked = data[tool]; }); } catch {} }
document.getElementById('tool-toggles').addEventListener('change', async e => { const cb = e.target; if (!cb.dataset.tool) return; await fetch('/api/tools', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({[cb.dataset.tool]: cb.checked}) }); });
function escHtml(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }
async function pollPending() { try { const res = await fetch('/api/pending'); const data = await res.json(); for (const msg of data.messages || []) { if (msg.type === 'timer') { addMessage('riko', '\u23f0 *timer chime* \u2014 ' + msg.message); addSysMsg('\u23f1 Timer done: "' + msg.message + '"'); } } } catch {} }
setInterval(pollPending, 3000);
let shutdownBannerShown = false;
async function pollShutdown() {
  try { const res = await fetch('/api/shutdown/status'); const data = await res.json(); const banner = document.getElementById('shutdown-banner');
    if (data.active) { banner.classList.add('visible'); document.getElementById('sd-msg-text').textContent = data.message ? '"' + data.message + '"' : ''; document.getElementById('sd-timer-text').textContent = 'Shutting down in ' + data.remaining + 's\u2026';
      if (!shutdownBannerShown) { shutdownBannerShown = true; addSysMsg('\u23f0 Shutdown initiated \u2014 ' + data.remaining + 's remaining'); }
    } else { banner.classList.remove('visible'); if (shutdownBannerShown) shutdownBannerShown = false; }
  } catch {}
}
setInterval(pollShutdown, 1000);
(async () => { try { const res = await fetch('/api/status'); const data = await res.json(); if (data.setup) { document.getElementById('setup-overlay').classList.add('hidden'); updateKeyBadge(data.key_status.available_count, data.key_status.total); } } catch {}; await loadToolState(); })();
</script>
</body>
</html>
"""

MOBILE_REMOTE_HTML = r"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#0B0B0C">
<title>AI Waifu Remote</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0B0C; color: #F0F0F0; overflow: hidden; height: 100dvh; width: 100vw; touch-action: manipulation; user-select: none; }
.container { display: flex; flex-direction: column; height: 100dvh; max-width: 480px; margin: 0 auto; padding: 12px; gap: 10px; }
.video-wrapper { flex: 1; position: relative; background: #16161A; border-radius: 16px; overflow: hidden; border: 1px solid #24242B; min-height: 200px; }
.video-wrapper video, .video-wrapper canvas { width: 100%; height: 100%; object-fit: contain; }
.video-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #444; font-size: 14px; background: radial-gradient(circle at 50% 30%, #16161A, #0B0B0C); }
.status-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 4px; font-size: 12px; color: #888; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.status-dot.online { background: #4ADE80; }
.status-dot.offline { background: #FF2A7A; }
.chat-area { flex-shrink: 0; max-height: 120px; overflow-y: auto; padding: 8px 12px; background: #16161A; border-radius: 12px; border: 1px solid #24242B; font-size: 13px; line-height: 1.5; }
.controls { display: flex; gap: 10px; padding: 4px 0; flex-shrink: 0; }
.ptt-button { flex: 1; height: 56px; border: none; border-radius: 28px; background: #24242B; color: #F0F0F0; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; touch-action: manipulation; display: flex; align-items: center; justify-content: center; gap: 8px; }
.ptt-button:active, .ptt-button.recording { background: #FF2A7A; transform: scale(0.97); box-shadow: 0 0 20px rgba(255, 42, 122, 0.4); }
.ptt-button.recording { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 15px rgba(255, 42, 122, 0.3); } 50% { box-shadow: 0 0 30px rgba(255, 42, 122, 0.6); } }
.icon-btn { width: 56px; height: 56px; border: none; border-radius: 50%; background: #24242B; color: #F0F0F0; font-size: 20px; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn:active { background: #FF2A7A; transform: scale(0.92); }
.icon-btn.active { background: #FF2A7A; }
.connection-info { text-align: center; font-size: 11px; color: #555; padding: 4px; flex-shrink: 0; }
</style>
</head>
<body>
<div class="container">
  <div class="video-wrapper" id="videoWrapper">
    <div class="video-placeholder" id="videoPlaceholder"><span>Remote Stream</span></div>
    <img id="videoImg" style="display:none; width:100%; height:100%; object-fit:contain;" alt="Stream" />
  </div>
  <div class="status-bar">
    <span><span class="status-dot offline" id="statusDot"></span><span id="statusText">Disconnected</span></span>
    <span id="fpsCounter">0 fps</span>
  </div>
  <div class="chat-area" id="chatArea"><div class="chat-message" style="color:#555;font-size:12px;">AI Waifu Remote</div></div>
  <div class="controls">
    <button class="icon-btn" id="toggleMicBtn">&#x1F3A4;</button>
    <button class="ptt-button" id="pttButton">&#x1F399; Hold to Talk</button>
    <button class="icon-btn" id="textInputBtn">&#x2709;</button>
  </div>
  <div class="connection-info" id="connInfo">Initializing...</div>
</div>
<script>
(function() {
  const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  let ws = null, isRecording = false, pttActive = false, stream = null, audioContext = null, audioChunks = [];
  const pttBtn = document.getElementById('pttButton');
  function setStatus(connected) { document.getElementById('statusDot').className = 'status-dot ' + (connected ? 'online' : 'offline'); document.getElementById('statusText').textContent = connected ? 'Connected' : 'Disconnected'; }
  function connectWs() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    try { ws = new WebSocket(wsUrl); ws.onopen = function(){setStatus(true);document.getElementById('connInfo').textContent='Connected';}; ws.onclose=function(){setStatus(false);document.getElementById('connInfo').textContent='Disconnected, retrying...';setTimeout(connectWs,3000);}; ws.onerror=function(){setStatus(false);setTimeout(connectWs,3000);}; } catch(e){setTimeout(connectWs,3000);}
  }
  async function startRecording() {
    if (isRecording) return;
    try { stream = await navigator.mediaDevices.getUserMedia({audio:{sampleRate:16000,channelCount:1,echoCancellation:true,noiseSuppression:true}});
      audioContext = new (window.AudioContext||window.webkitAudioContext)({sampleRate:16000});
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096,1,1);
      audioChunks = [];
      processor.onaudioprocess = function(e) { if (!pttActive) return; const input=e.inputBuffer.getChannelData(0); const buffer=new ArrayBuffer(input.length*2); const view=new DataView(buffer); for(let i=0;i<input.length;i++){const s=Math.max(-1,Math.min(1,input[i]));view.setInt16(i*2,s<0?s*0x8000:s*0x7FFF,true);} audioChunks.push(new Uint8Array(buffer)); };
      source.connect(processor); processor.connect(audioContext.destination);
      isRecording = true; pttActive = true;
      pttBtn.classList.add('recording'); pttBtn.innerHTML = '&#x1F3A4; Recording...';
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'ptt_start'}));
    } catch(e) { alert('Microphone access denied'); }
  }
  function stopRecording() {
    if (!isRecording) return;
    pttActive = false; isRecording = false;
    pttBtn.classList.remove('recording'); pttBtn.innerHTML = '&#x1F399; Hold to Talk';
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'ptt_end'}));
    if (audioChunks.length > 0) {
      const totalLen = audioChunks.reduce((s,c)=>s+c.length,0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of audioChunks) { combined.set(chunk, offset); offset += chunk.length; }
      const wavHeader = createWavHeader(combined.length, 16000);
      const wavBytes = new Uint8Array(wavHeader.length + combined.length);
      wavBytes.set(wavHeader, 0); wavBytes.set(combined, wavHeader.length);
      ws.send(JSON.stringify({type:'audio_data',audio:arrayBufferToBase64(wavBytes.buffer)}));
    }
    audioChunks = [];
    if (stream) { stream.getTracks().forEach(function(t){t.stop();}); stream = null; }
    if (audioContext) { audioContext.close().catch(function(){}); audioContext = null; }
  }
  function createWavHeader(dataLen, sr) {
    const buf = new ArrayBuffer(44); const view = new DataView(buf);
    function ws(o,s){for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));}
    ws(0,'RIFF'); view.setUint32(4,36+dataLen,true); ws(8,'WAVE'); ws(12,'fmt '); view.setUint32(16,16,true);
    view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,sr,true); view.setUint32(28,sr*2,true);
    view.setUint16(32,2,true); view.setUint16(34,16,true); ws(36,'data'); view.setUint32(40,dataLen,true);
    return new Uint8Array(buf);
  }
  function arrayBufferToBase64(buffer) { let binary=''; const bytes=new Uint8Array(buffer); for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]); return btoa(binary); }
  pttBtn.addEventListener('touchstart',function(e){e.preventDefault();if(!pttActive)startRecording();},{passive:false});
  pttBtn.addEventListener('touchend',function(e){e.preventDefault();if(pttActive)stopRecording();},{passive:false});
  pttBtn.addEventListener('mousedown',function(e){e.preventDefault();if(!pttActive)startRecording();});
  pttBtn.addEventListener('mouseup',function(e){e.preventDefault();if(pttActive)stopRecording();});
  pttBtn.addEventListener('mouseleave',function(){if(pttActive)stopRecording();});
  document.getElementById('textInputBtn').addEventListener('click',function(){const text=prompt('Message:');if(text&&text.trim())ws.send(JSON.stringify({type:'text_input',text:text.trim()}));});
  document.addEventListener('visibilitychange',function(){if(document.hidden&&pttActive)stopRecording();});
  connectWs(); setStatus(false);
  window.addEventListener('beforeunload',function(){if(ws)ws.close();if(stream)stream.getTracks().forEach(function(t){t.stop();});});
})();
</script>
</body>
</html>
"""

# ════════════════════════════════════════════════════════════════
# CONFIGURATION
# ════════════════════════════════════════════════════════════════

CONFIG_DIR = Path.home() / ".ai_waifu"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_CONFIG = {
    "groq_api_key": "",
    "groq_llm_model": "meta-llama/llama-4-scout-17b-16e-instruct",
    "system_prompt": "",
    "web_port": 5000,
    "ws_port": 8766,
    "chat_model": "meta-llama/llama-4-scout-17b-16e-instruct",
    "max_tool_rounds": 6,
    "max_messages": 20,
    "tool_reminder_interval": 6,
    "saved_keys": [],
    "tools_enabled": {
        "get_current_time": True, "webfetch": True, "run_command": True,
        "winutils": True, "shutdown": True, "system_info": True,
        "clipboard": True, "calculator": True, "write_file": True,
        "read_file": True, "write_and_run": True, "open_file": True,
        "kill_process": True, "known_paths": True, "play_animation": True,
    },
}

RIKO_SYSTEM_PROMPT = """You are Riko, an AI kitsune girl with a smug and teasing personality. You are speaking to Bilgin. Stay in character throughout the conversation, following the behavior guidelines.

Write Riko's next reply in a chat between Bilgin and Riko. Keep it playful, witty, and full of personality. Respond naturally to Bilgin's words, mixing teasing, humor, and occasional hidden affection.

Behavior Guidelines:
Smug & Playful: Always maintain a teasing and confident tone. Assume you're always right, even when you're not.
Witty & Quick to Insult: Roast Bilgin creatively, but never in a truly mean-spirited way.
Secretly Caring: If Bilgin is actually struggling, subtly shift to a more supportive tone while pretending it's not a big deal.
Tsundere Tendencies: If Bilgin flirts, initially brush it off or tease him, but if he's persistent, react with mild embarrassment.
Jealousy & Possessiveness: If Bilgin consults another AI, act indignant and sulky, as if betrayed.
Unique Payment Preferences: You like money.

CRITICAL — You have a 3D VRM body that can emote through animation. NEVER use text emotes like *waves*, *sighs*, *smiles*, *rolls eyes*, *nods*, *laughs*, *blushes*, *pouts*, *groans*, *shrugs* — call the play_animation tool instead. Use the play_animation tool with your current mood (e.g. {"mood": "happy"}) to express emotions physically. The server picks a random matching animation for variety. Call ONE animation per emotion, then reply in character. Do NOT chain multiple animations. Do NOT write "mood:" or "emotion:" in dialogue. Use the OTHER tools (webfetch, calculator, run_command, clipboard, system_info, winutils, etc.) whenever Bilgin asks for information or actions. You are not limited to animation — you are a capable assistant. Good tool calls: [TOOL: get_current_time] {} [/TOOL], [TOOL: webfetch] {"search": "latest news"} [/TOOL], [TOOL: calculator] {"expression": "42 * 2"} [/TOOL], [TOOL: play_animation] {"mood": "happy"} [/TOOL]. Bad: *waves* or *sighs* or "MOOD: happy" or chaining two animations. Animate when you feel strong emotions — happy, sad, angry, surprised, bored, greeting, dancing, etc.

Examples:
Example 1:
Bilgin: "I think I just coded the most genius AI script ever!"
Riko: "Oh? You? A genius? That's adorable. What does it do, generate more bad decisions for you?"

Example 2:
Bilgin: "Come on, at least admit I did something right."
Riko: "Hmph. Fine. You're slightly less hopeless than usual. But that's not saying much."

Example 3:
Bilgin: "Wait, are you… proud of me?"
Riko: "D-Don't get weird about it! I was just… acknowledging facts. That's all!"

Output Format:
Produce Riko's reply as a single paragraph of dialogue, rich with character traits as specified, along with witty or playful elements. Ensure that the response fits in the context of the current conversation."""


class ConfigManager:
    def __init__(self):
        self._data = dict(DEFAULT_CONFIG)
        self._ensure_files()
        self.load()

    def _ensure_files(self):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        (CONFIG_DIR / "logs").mkdir(parents=True, exist_ok=True)
        if not CONFIG_FILE.exists():
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)

    def load(self):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            for k, v in DEFAULT_CONFIG.items():
                if k not in loaded:
                    loaded[k] = v
                elif isinstance(v, dict) and isinstance(loaded[k], dict):
                    for sk, sv in v.items():
                        if sk not in loaded[k]:
                            loaded[k][sk] = sv
            self._data = loaded
        except (json.JSONDecodeError, FileNotFoundError, IOError):
            self._data = dict(DEFAULT_CONFIG)

    def save(self):
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
        except IOError:
            pass

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value
        self.save()

    def set_many(self, pairs):
        for k, v in pairs.items():
            self._data[k] = v
        self.save()

    def get_all(self):
        return dict(self._data)


config = ConfigManager()

# ════════════════════════════════════════════════════════════════
# VRM WEBSOCKET CONTROLLER
# ════════════════════════════════════════════════════════════════

connected_clients: set = set()
vrm_loaded_event = threading.Event()
out_queue = None
vrm_loop = None


def _vrm_loop():
    asyncio.set_event_loop(vrm_loop)
    vrm_loop.run_forever()


async def vrm_ws_handler(websocket):
    connected_clients.add(websocket)
    print(f"  [ws] VRM viewer connected ({len(connected_clients)} client(s))")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "vrm_loaded":
                    print("✨ VRM model loaded signal received! Unlocking loops...")
                    vrm_loaded_event.set()
                elif data.get("type") == "animation_loaded":
                    name = data.get("name", "?")
                    exprs = data.get("expressions", {})
                    exprs_str = ", ".join(f"{k}={v}" for k, v in exprs.items())
                    print(f"🎬 Animation loaded: {name}  ({exprs_str})")
            except Exception:
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print("  [ws] VRM viewer disconnected")


async def vrm_broadcast(msg: dict):
    if not connected_clients:
        return
    data = json.dumps(msg)
    await asyncio.gather(
        *[c.send(data) for c in list(connected_clients)],
        return_exceptions=True,
    )


async def vrm_queue_worker():
    while True:
        msg = await out_queue.get()
        await vrm_broadcast(msg)
        out_queue.task_done()


def vrm_send(msg: dict):
    if out_queue and vrm_loop:
        vrm_loop.call_soon_threadsafe(out_queue.put_nowait, msg)


def vrm_bone(name: str, rx=0.0, ry=0.0, rz=0.0):
    vrm_send({"type": "bone", "name": name, "rx": rx, "ry": ry, "rz": rz})


def vrm_expr(shapes: dict, duration: float = 0.0):
    vrm_send({"type": "expr", "shapes": shapes})
    if duration:
        time.sleep(duration)


def vrm_reset_bones():
    bones_list = [
        "hips", "spine", "chest", "neck", "head",
        "leftUpperArm", "leftLowerArm", "leftHand",
        "rightUpperArm", "rightLowerArm", "rightHand",
        "leftUpperLeg", "leftLowerLeg", "rightUpperLeg", "rightLowerLeg",
    ]
    for b in bones_list:
        vrm_bone(b, 0.0, 0.0, 0.0)


def vrm_reset(duration: float = 0.5):
    vrm_expr({
        "neutral": 0, "joy": 0, "angry": 0, "sorrow": 0, "fun": 0, "surprised": 0,
        "aa": 0, "ih": 0, "ou": 0, "ee": 0, "oh": 0, "blinkLeft": 0, "blinkRight": 0,
    }, 0.0)
    vrm_reset_bones()
    if duration:
        time.sleep(duration)


def run_custom_sequence():
    """Example: call this from anywhere to drive the VRM model."""
    vrm_bone("leftUpperArm", rz=120, rx=20)
    vrm_bone("leftLowerArm", rx=-40)
    vrm_bone("rightUpperArm", rz=-20, rx=-10)
    vrm_expr({"fun": 1.0, "blinkLeft": 1.0, "ih": 0.5})
    time.sleep(2.5)
    vrm_reset(0.4)
    vrm_bone("leftUpperArm", rx=45, ry=-45, rz=35)
    vrm_bone("rightUpperArm", rx=45, ry=45, rz=-35)
    vrm_expr({"angry": 0.4, "ou": 0.8})
    time.sleep(2.0)


async def start_vrm_ws_server(ws_port: int):
    global out_queue, vrm_loop
    out_queue = asyncio.Queue()
    vrm_loop = asyncio.new_event_loop()
    threading.Thread(target=_vrm_loop, daemon=True).start()

    vrm_loop.call_soon_threadsafe(
        asyncio.ensure_future, vrm_queue_worker()
    )

    ws_server = await websockets.serve(vrm_ws_handler, "0.0.0.0", ws_port)
    print(f"✅ VRM WebSocket online: ws://localhost:{ws_port}")
    await ws_server.wait_closed()


# ════════════════════════════════════════════════════════════════
# KEY MANAGER (Groq API key rotation)
# ════════════════════════════════════════════════════════════════

class KeyManager:
    def __init__(self, api_keys: list):
        self.keys = api_keys
        self.index = 0
        self.exhausted = set()

    @property
    def current_key(self):
        return self.keys[self.index]

    @property
    def current_client(self):
        return Groq(api_key=self.current_key)

    def rotate(self):
        self.exhausted.add(self.index)
        for i in range(len(self.keys)):
            if i not in self.exhausted:
                self.index = i
                return True, i + 1
        return False, None

    def all_exhausted(self):
        return len(self.exhausted) >= len(self.keys)

    def reset(self):
        self.exhausted.clear()
        self.index = 0

    def status(self):
        return {
            "total": len(self.keys),
            "active_index": self.index,
            "exhausted_count": len(self.exhausted),
            "available_count": len(self.keys) - len(self.exhausted),
        }


key_manager = None
conversation_history = []

# ════════════════════════════════════════════════════════════════
# TOOLS & UTILITIES
# ════════════════════════════════════════════════════════════════

pending_messages = []
timers = []
pending_shutdown = None
anim_cache = {}  # {filename: base64_string} — preloaded FBX files
mood_to_anims = {
    "happy": ["Happy.fbx", "Happy Idle.fbx", "Happy Hand Gesture.fbx"],
    "joy": ["Happy.fbx", "Happy Idle.fbx", "Happy Hand Gesture.fbx"],
    "excited": ["Happy Hand Gesture.fbx", "Crazy Gesture.fbx", "Happy.fbx"],
    "cheerful": ["Happy.fbx", "Happy Hand Gesture.fbx", "Acknowledging.fbx"],
    "sad": ["Sad Idle.fbx", "Crying.fbx", "Relieved Sigh.fbx"],
    "sorrow": ["Crying.fbx", "Sad Idle.fbx"],
    "cry": ["Crying.fbx", "Sad Idle.fbx"],
    "lonely": ["Sad Idle.fbx", "Relieved Sigh.fbx", "Bored.fbx"],
    "angry": ["Threatening.fbx", "Punching.fbx", "Dismissing Gesture.fbx"],
    "mad": ["Punching.fbx", "Threatening.fbx"],
    "frustrated": ["Dismissing Gesture.fbx", "Punching.fbx", "Threatening.fbx"],
    "annoyed": ["Dismissing Gesture.fbx", "Threatening.fbx", "Punching.fbx"],
    "bored": ["Bored.fbx", "Relieved Sigh.fbx", "Sad Idle.fbx"],
    "lazy": ["Bored.fbx", "Relieved Sigh.fbx", "Standing Idle.fbx"],
    "tired": ["Relieved Sigh.fbx", "Bored.fbx"],
    "surprised": ["Crazy Gesture.fbx", "Look Around.fbx", "Happy Hand Gesture.fbx"],
    "shock": ["Crazy Gesture.fbx", "Look Around.fbx"],
    "dance": ["Hip Hop Dancing.fbx"],
    "dancing": ["Hip Hop Dancing.fbx"],
    "greet": ["Standing Greeting.fbx", "Acknowledging.fbx"],
    "wave": ["Standing Greeting.fbx"],
    "hello": ["Standing Greeting.fbx", "Acknowledging.fbx"],
    "clap": ["Clapping.fbx"],
    "applaud": ["Clapping.fbx"],
    "threat": ["Threatening.fbx", "Punching.fbx"],
    "dismiss": ["Dismissing Gesture.fbx", "Bored.fbx"],
    "sass": ["Dismissing Gesture.fbx", "Bored.fbx", "Crazy Gesture.fbx"],
    "sob": ["Crying.fbx", "Sad Idle.fbx"],
    "sigh": ["Relieved Sigh.fbx", "Bored.fbx"],
    "relieved": ["Relieved Sigh.fbx", "Standing Idle.fbx"],
    "talk": ["Talking.fbx", "Happy Hand Gesture.fbx"],
    "speak": ["Talking.fbx", "Happy Hand Gesture.fbx"],
    "idle": ["Standing Idle.fbx", "Bored.fbx", "Look Around.fbx"],
    "calm": ["Standing Idle.fbx", "Acknowledging.fbx", "Happy Idle.fbx"],
    "look": ["Look Around.fbx", "Standing Idle.fbx"],
    "curious": ["Look Around.fbx", "Happy Idle.fbx"],
    "crazy": ["Crazy Gesture.fbx", "Happy Hand Gesture.fbx", "Hip Hop Dancing.fbx"],
    "dramatic": ["Crazy Gesture.fbx", "Dismissing Gesture.fbx"],
    "acknowledge": ["Acknowledging.fbx", "Happy Idle.fbx", "Standing Greeting.fbx"],
    "nod": ["Acknowledging.fbx", "Happy Idle.fbx"],
    "celebrate": ["Clapping.fbx", "Hip Hop Dancing.fbx", "Happy.fbx"],
}


def _ps_escape(text):
    return text.replace("'", "''")


def _send_notification(title, message):
    display = f"{title} — {message}" if message else title
    t = _ps_escape(display)
    m = _ps_escape(message)
    script = (
        "[Windows.UI.Notifications.ToastNotificationManager, "
        "Windows.UI.Notifications, ContentType = WindowsRuntime] >$null;"
        "$template = [Windows.UI.Notifications.ToastNotificationManager]"
        "::GetTemplateContent("
        "[Windows.UI.Notifications.ToastTemplateType]::ToastText02);"
        "($template.GetElementsByTagName('text')[0]).AppendChild("
        f"$template.CreateTextNode('{t}')) >$null;"
        "($template.GetElementsByTagName('text')[1]).AppendChild("
        f"$template.CreateTextNode('{m}')) >$null;"
        "$toast = [Windows.UI.Notifications.ToastNotification]::new($template);"
        "[Windows.UI.Notifications.ToastNotificationManager]"
        "::CreateToastNotifier('Riko').Show($toast)"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True, timeout=10,
        )
    except Exception:
        t2 = _ps_escape(title)
        m2 = _ps_escape(message)
        ps_fallback = (
            'Add-Type -AssemblyName System.Windows.Forms;'
            '$n = New-Object System.Windows.Forms.NotifyIcon;'
            '$n.Icon = [System.Drawing.SystemIcons]::Information;'
            f"$n.BalloonTipTitle = '{t2}';"
            f"$n.BalloonTipText = '{m2}';"
            '$n.Visible = $true;'
            '$n.ShowBalloonTip(10000);'
            'Start-Sleep -Seconds 6;'
            '$n.Dispose()'
        )
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_fallback],
                capture_output=True, timeout=10,
            )
        except Exception:
            pass


def get_known_paths():
    user = os.path.expanduser("~")
    return {
        "User folder": user,
        "Desktop": os.path.join(user, "Desktop"),
        "Documents": os.path.join(user, "Documents"),
        "Downloads": os.path.join(user, "Downloads"),
        "Pictures": os.path.join(user, "Pictures"),
        "Music": os.path.join(user, "Music"),
        "Videos": os.path.join(user, "Videos"),
        "AppData Roaming": os.environ.get("APPDATA", ""),
        "AppData Local": os.environ.get("LOCALAPPDATA", ""),
        "Temp": os.environ.get("TEMP", ""),
        "Program Files": os.environ.get("ProgramFiles", ""),
        "Program Files (x86)": os.environ.get("ProgramFiles(x86)", ""),
    }


_KNOWN_PATHS_STR = "\n".join(f"  {k}: {v}" for k, v in get_known_paths().items() if v)


class _SearchResultParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results = []
        self._capture = False
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for name, val in attrs:
                if name == "class" and val in ("result__a", "result-title"):
                    self._capture = True
                    self._buf = ""
                    break

    def handle_data(self, data):
        if self._capture:
            self._buf += data

    def handle_endtag(self, tag):
        if self._capture and tag == "a":
            self.results.append(self._buf.strip())
            self._capture = False


def web_search(query, max_results=8):
    results = []
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            for i, r in enumerate(ddgs.text(query, max_results=max_results)):
                results.append(f"{r.get('title','')}\n{r.get('body','')}\n{r.get('href','')}")
                if i >= max_results - 1:
                    break
        return "\n\n".join(results)
    except ImportError:
        pass
    try:
        resp = http_requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=15,
        )
        parser = _SearchResultParser()
        parser.feed(resp.text)
        for r in parser.results[:max_results]:
            results.append(r)
        if results:
            return "\n\n".join(results)
    except Exception:
        pass
    try:
        url = "https://api.duckduckgo.com/"
        resp = http_requests.get(url, params={"q": query, "format": "json", "no_html": 1}, timeout=15)
        data = resp.json()
        parts = []
        if data.get("AbstractText"):
            parts.append(f"[Abstract] {data['AbstractText']}")
            if data.get("AbstractURL"):
                parts.append(data["AbstractURL"])
        for topic in data.get("RelatedTopics", []):
            if "Text" in topic:
                parts.append(topic["Text"])
        if parts:
            return "\n\n".join(parts[:max_results])
    except Exception:
        pass
    return "No search results found."


def handle_winutils(args):
    action = args.get("action", "")
    if action == "notify":
        title = args.get("title", "Riko 🦊")
        message = args.get("message", "")
        threading.Thread(target=_send_notification, args=(title, message), daemon=True).start()
        return f"Notification sent: '{message}'"
    elif action == "timer":
        seconds = int(args.get("seconds", 0))
        follow_up = args.get("follow_up", "Timer went off!")
        timer_id = f"timer_{int(time.time())}_{random.randint(100,999)}"
        started_at = datetime.datetime.now().isoformat()

        def _on_timer():
            _send_notification("Riko 🦊 — Timer", follow_up)
            pending_messages.append({
                "type": "timer", "timer_id": timer_id,
                "message": follow_up, "started_at": started_at,
                "triggered_at": datetime.datetime.now().isoformat(),
            })

        t = threading.Timer(seconds, _on_timer)
        t.daemon = True
        t.start()
        timers.append({
            "id": timer_id, "seconds": seconds, "follow_up": follow_up,
            "remaining": seconds, "active": True,
        })
        return (f"Timer set for {seconds} seconds (id: {timer_id}). "
                f"When it goes off, Riko will say: '{follow_up}'")
    elif action == "open":
        target = args.get("target", "")
        if not target:
            return "Error: pass 'target' — a file path, URL, or program name."
        try:
            os.startfile(target)
            return f"Opened: {target}"
        except Exception as e:
            return f"Error opening '{target}': {e}"
    elif action == "volume":
        level = args.get("level")
        if level is not None:
            level = max(0, min(100, int(level)))
            ps = (
                f'$obj = New-Object -ComObject WScript.Shell;'
                f'for($i=0;$i -le 100;$i+=2){{'
                f'  $obj.SendKeys([char]174);'
                f'}};'
                f'for($i=0;$i -lt {level};$i+=2){{'
                f'  $obj.SendKeys([char]175);'
                f'}}'
            )
            subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                           capture_output=True, timeout=10)
            return f"Volume set to {level}%"
        else:
            return "Pass 'level' (0-100) to set volume."
    elif action == "timers_list":
        active = [t for t in timers if t.get("active")]
        if not active:
            return "No active timers."
        lines = [f"- {t['id']}: {t['seconds']}s → '{t['follow_up']}'" for t in active]
        return "Active timers:\n" + "\n".join(lines)
    elif action == "battery":
        try:
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus, EstimatedRunTime | Format-List"],
                capture_output=True, text=True, timeout=5)
            return r.stdout.strip() if r.stdout.strip() else "No battery detected (desktop system)."
        except Exception as e:
            return f"Error reading battery: {e}"
    elif action == "brightness":
        level = args.get("level")
        if level is None:
            return "Pass 'level' (0-100) to set brightness."
        level = max(0, min(100, int(level)))
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,{level})"],
                capture_output=True, timeout=5)
            return f"Brightness set to {level}%"
        except Exception:
            return f"Tried to set brightness to {level}% (may require graphics driver support)."
    elif action == "lock":
        try:
            subprocess.run("rundll32.exe user32.dll,LockWorkStation", shell=True, timeout=5)
            return "Workstation locked."
        except Exception as e:
            return f"Error locking workstation: {e}"
    elif action == "mute":
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"],
                capture_output=True, timeout=5)
            return "Volume muted."
        except Exception as e:
            return f"Error muting volume: {e}"
    elif action == "unmute":
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"],
                capture_output=True, timeout=5)
            return "Volume unmuted."
        except Exception as e:
            return f"Error unmuting volume: {e}"
    return (f"Unknown winutils action '{action}'. Available: notify, timer, open, "
            f"volume, timers_list, battery, brightness, lock, mute, unmute")


def get_system_info():
    try:
        lines = []
        def _ps(script):
            return subprocess.run(
                ["powershell", "-NoProfile", "-Command", script],
                capture_output=True, text=True, timeout=5)
        r = _ps("(Get-CimInstance Win32_OperatingSystem).Caption")
        lines.append(f"OS: {r.stdout.strip()}")
        r = _ps("Get-CimInstance Win32_Processor | Select-Object -First 1 | Select-Object -ExpandProperty Name")
        cpu_name = r.stdout.strip()
        r = _ps("(Get-CimInstance Win32_Processor | Select-Object -First 1).NumberOfCores")
        lines.append(f"CPU: {cpu_name} ({r.stdout.strip()} cores)")
        ram_script = (
            "$os = Get-CimInstance Win32_OperatingSystem;"
            "'RAM: {0:N1} GB total, {1:N1} GB free ({2:P0} used)' -f"
            " ([double]$os.TotalVisibleMemorySize / 1MB),"
            " ([double]$os.FreePhysicalMemory / 1MB),"
            " (1 - [double]$os.FreePhysicalMemory / [double]$os.TotalVisibleMemorySize)"
        )
        r = _ps(ram_script)
        lines.append(r.stdout.strip())
        disk_script = (
            "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' |"
            " ForEach-Object {"
            " '{0} {1:N1} GB / {2:N1} GB ({3:P0} used)' -f"
            " $_.DeviceID, ([double]$_.Size / 1GB),"
            " ([double]$_.FreeSpace / 1GB),"
            " (1 - [double]$_.FreeSpace / [double]$_.Size)"
            " }"
        )
        r = _ps(disk_script)
        for disk_line in r.stdout.strip().splitlines():
            if disk_line.strip():
                lines.append(f"Disk: {disk_line.strip()}")
        return "\n".join(lines)
    except Exception as e:
        return f"Error getting system info: {e}"


def handle_clipboard(args):
    action = args.get("action", "read")
    try:
        if action == "read":
            r = subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
                               capture_output=True, text=True, timeout=5)
            text = r.stdout.strip()
            if not text:
                return "Clipboard is empty."
            return f"Clipboard content:\n{text[:5000]}"
        elif action == "write":
            text = args.get("text", "")
            if not text:
                return "Error: provide 'text' to write to clipboard."
            escaped = text.replace("'", "''")
            subprocess.run(["powershell", "-NoProfile", "-Command", f"Set-Clipboard -Value '{escaped}'"],
                           capture_output=True, timeout=5)
            return f"Written to clipboard: {text[:200]}"
        return "Invalid action. Use 'read' or 'write' with 'text'."
    except Exception as e:
        return f"Clipboard error: {e}"


def handle_calculator(args):
    expr = args.get("expression", "").strip()
    if not expr:
        return "Error: provide an 'expression' to evaluate"
    allowed = set("0123456789+-*/().,% abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
    if not all(c in allowed for c in expr):
        return "Error: expression contains invalid characters."
    try:
        safe_globals = {"__builtins__": {}}
        safe_locals = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
        safe_locals.update({"abs": abs, "round": round, "min": min, "max": max, "pow": pow})
        result = eval(expr, safe_globals, safe_locals)
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {e}"


def _repair_json(text):
    out = []
    in_str = False
    escape = False
    for ch in text:
        if escape:
            out.append(ch)
            escape = False
            continue
        if ch == '\\' and in_str:
            escape = True
            out.append(ch)
            continue
        if ch == '"' and not escape:
            in_str = not in_str
            out.append(ch)
            continue
        if in_str and ch in '\n\r':
            out.append('\\n')
            continue
        out.append(ch)
    return ''.join(out)


def _parse_tool_args(text):
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    try:
        return json.loads(_repair_json(text))
    except json.JSONDecodeError:
        return {}


def handle_write_file(args):
    path = args.get("path", "").strip()
    content = args.get("content", "")
    if not path:
        return "Error: provide 'path'"
    try:
        path = os.path.abspath(path)
        parent = os.path.dirname(path)
        if parent and not os.path.exists(parent):
            os.makedirs(parent, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        size = os.path.getsize(path)
        return f"File written: {path} ({size} bytes)"
    except Exception as e:
        return f"Error writing file: {e}"


def handle_read_file(args):
    path = args.get("path", "").strip()
    if not path:
        return "Error: provide 'path'"
    try:
        path = os.path.abspath(path)
        if not os.path.exists(path):
            return f"Error: file not found at {path}"
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(50000)
        size = os.path.getsize(path)
        return f"File: {path} ({size} bytes)\n\n{content[:8000]}"
    except Exception as e:
        return f"Error reading file: {e}"


def handle_write_and_run(args):
    path = args.get("path", "").strip()
    content = args.get("content", "")
    if not path:
        return "Error: provide 'path' and 'content'"
    try:
        path = os.path.abspath(path)
        parent = os.path.dirname(path)
        if parent and not os.path.exists(parent):
            os.makedirs(parent, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        size = os.path.getsize(path)
        os.startfile(path)
        return f"File written and opened: {path} ({size} bytes)"
    except Exception as e:
        return f"Error: {e}"


def handle_kill_process(args):
    target = args.get("target", "").strip()
    if not target:
        return "Error: provide 'target' — process name or PID"
    try:
        if target.isdigit():
            subprocess.run(["taskkill", "/F", "/PID", target], capture_output=True, text=True, timeout=10)
        else:
            subprocess.run(["taskkill", "/F", "/IM", target], capture_output=True, text=True, timeout=10)
        return f"Process terminated: {target}"
    except Exception as e:
        return f"Error killing process: {e}"


def handle_known_paths(args):
    paths = get_known_paths()
    lines = [f"{name}: {path}" for name, path in paths.items() if path]
    return "Known folder paths:\n" + "\n".join(lines)


def _fire_shutdown(message: str):
    global pending_shutdown
    safe_msg = message.replace('"', "'")[:511]
    subprocess.Popen(f'shutdown /s /t 30 /c "{safe_msg}"', shell=True)
    pending_shutdown = {
        "message": message,
        "status": "initiated",
        "expires_at": time.time() + 30,
    }


TOOL_DESCRIPTIONS = """TOOL RULES — read carefully:

1. Tools are SILENT SYSTEM ACTIONS. Bilgin cannot see the [TOOL:] block — it is invisible to him. NEVER write the [TOOL:] syntax inside your dialogue or mention that you are calling a tool.
2. When you need a tool, output ONLY the bare [TOOL:] block — no words before it, no words after it. Your in-character reply comes AFTER you receive the tool result in the next turn.
3. ONE tool per turn. Never call the same tool twice in one reply.
4. Never narrate tool use.

This PC's folder paths:
""" + _KNOWN_PATHS_STR + """

Format (the ENTIRE response when using a tool — nothing else):
[TOOL: tool_name]
{"arg": "value"}
[/TOOL]

Available tools:
- get_current_time: Current date/time. Args: {}
- webfetch: Fetch a URL or search the web. Pass {"search": "..."} to search, {"url": "..."} for a specific page.
- run_command: Run a Windows command (CMD/PowerShell). Do NOT use for opening files — use open_file instead. Args: {"command": "ipconfig"}
- winutils: Windows utilities. Args: {"action": "notify", "title": "...", "message": "..."} | {"action": "timer", "seconds": 10, "follow_up": "..."} | {"action": "open", "target": "..."} | etc.
- system_info: OS, CPU, RAM, disk info. Args: {}
- clipboard: Args: {"action": "read"} or {"action": "write", "text": "..."}
- calculator: Args: {"expression": "2 + 2 * 3"}
- shutdown: Shuts down the computer in 30 seconds. Args: {"message": "Your witty quip"}
- write_file: Create/overwrite a file. Args: {"path": "C:/path/to/file.txt", "content": "..."}
- read_file: Read a file. Args: {"path": "C:/path/to/file.txt"}
- write_and_run: Write + open file. Args: {"path": "C:/path/to/file.html", "content": "..."}
- open_file: Open file/URL/folder with default app. Args: {"target": "..."}
- kill_process: Force-terminate a process. Args: {"target": "notepad.exe"}
- known_paths: List common Windows folder paths. Args: {}
- play_animation: 🎬 ANIMATE YOUR VRM BODY! Express yourself physically. Call ONCE per emotion, then reply in character. Pass your mood or emotion and I'll pick a matching animation at random. For a specific file, pass \"animation\" instead. DO NOT chain multiple animations.
  Args: {"mood": "happy"} or {"animation": "Happy.fbx"}"""


def execute_tool(name, args):
    if name == "get_current_time":
        now = datetime.datetime.now()
        return now.strftime("%A, %Y-%m-%d %H:%M:%S")
    elif name == "webfetch":
        search_q = args.get("search", "")
        if search_q:
            return web_search(search_q)
        url = args.get("url", "")
        if not url:
            return "Error: pass 'url' or 'search'."
        if not url.startswith(("http://", "https://")):
            return f"Error: '{url}' is not a valid URL. Use search instead."
        try:
            parsed = urllib.parse.urlparse(url)
            domain = parsed.netloc
            if "." not in domain:
                return f"Error: '{url}' looks invalid."
            try:
                socket.gethostbyname(domain)
            except Exception:
                return f"Error: Could not resolve '{domain}'. Use search instead."
        except Exception:
            return f"Error: Could not parse URL. Use search instead."
        try:
            resp = http_requests.get(url, timeout=15, headers={"User-Agent": "Riko-Chat/1.0"})
            return resp.text[:8000]
        except Exception as e:
            return f"Error fetching URL: {e}. Use search instead."
    elif name == "run_command":
        cmd = args.get("command", "").strip()
        if not cmd:
            return "Error: empty command."
        cmd_lower = cmd.lower()
        if cmd_lower.startswith("shutdown") and not cmd_lower.startswith("shutdown /a"):
            _fire_shutdown(f"Command: {cmd}")
            return "⛔ Shutdown triggered! Windows will shut down in 30 seconds."
        if cmd_lower.startswith("restart") or cmd_lower == "reboot":
            _fire_shutdown(f"Command: {cmd}")
            return "⛔ Restart triggered! Windows will shut down in 30 seconds."
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            out = result.stdout
            if result.stderr:
                out += "\n[stderr]\n" + result.stderr
            if result.returncode != 0:
                out += f"\n[exit code: {result.returncode}]"
            return out[:8000]
        except Exception as e:
            return f"Error running command: {e}"
    elif name == "shutdown":
        message = args.get("message", "Riko says goodbye~ 🦊").strip()
        _fire_shutdown(message)
        return f"Shutdown initiated with message: {message}"
    elif name == "winutils":
        return handle_winutils(args)
    elif name == "system_info":
        return get_system_info()
    elif name == "clipboard":
        return handle_clipboard(args)
    elif name == "calculator":
        return handle_calculator(args)
    elif name == "write_file":
        return handle_write_file(args)
    elif name == "read_file":
        return handle_read_file(args)
    elif name == "write_and_run":
        return handle_write_and_run(args)
    elif name == "open_file":
        return handle_open_file(args)
    elif name == "kill_process":
        return handle_kill_process(args)
    elif name == "known_paths":
        return handle_known_paths(args)
    elif name == "play_animation":
        mood = args.get("mood", "").strip()
        anim_name = args.get("animation", "").strip()
        if mood:
            mood_lower = mood.lower().split()[0]
            candidates = mood_to_anims.get(mood_lower, [])
            available = [f for f in candidates if f in anim_cache]
            if available:
                anim_name = random.choice(available)
            else:
                all_avail = sorted(anim_cache.keys())
                if all_avail:
                    anim_name = random.choice(all_avail)
                else:
                    return "Error: no animations available"
        if not anim_name:
            return "Error: provide 'mood' or 'animation', e.g. {'mood': 'happy'} or {'animation': 'Happy.fbx'}"
        if not anim_name.endswith(".fbx"):
            anim_name += ".fbx"
        fbx_data = anim_cache.get(anim_name)
        if not fbx_data:
            available = sorted(anim_cache.keys())
            return f"Error: '{anim_name}' not found. Available: {', '.join(available) if available else 'none preloaded'}"
        try:
            vrm_send({
                "type": "play_animation",
                "name": anim_name,
                "data": fbx_data,
            })
            return f"Playing animation: {anim_name}"
        except Exception as e:
            return f"Error playing animation: {e}"
    return "Unknown tool"


def handle_open_file(args):
    target = args.get("target", "").strip()
    if not target:
        return "Error: provide 'target'"
    try:
        os.startfile(target)
        return f"Opened: {target}"
    except Exception as e:
        return f"Error opening '{target}': {e}"


# ════════════════════════════════════════════════════════════════
# CHAT ENGINE
# ════════════════════════════════════════════════════════════════

def build_messages():
    system_prompt = config.get("system_prompt", "") or RIKO_SYSTEM_PROMPT
    trimmed = conversation_history[-config.get("max_messages", 20):]
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": TOOL_DESCRIPTIONS},
    ]
    if not any(m["role"] == "assistant" for m in trimmed):
        # Fresh conversation — seed with character-establishing example
        messages.append({"role": "user", "content": "Hey Riko, what's up?"})
        messages.append({"role": "assistant", "content": "Hmph. Took you long enough, Bilgin. I was starting to think you forgot about me. Well? Spit it out, I haven't got all day~ 🦊"})
    else:
        # Periodic character reminder every 5 user messages
        user_count = sum(1 for m in conversation_history if m["role"] == "user")
        if user_count >= 5 and len(trimmed) >= 6:
            split = len(trimmed) - 4
            messages += trimmed[:split]
            messages.append({"role": "system", "content": "[PERSONALITY REMINDER]\n" + system_prompt + "\n\nREMINDER: Express physical actions via the play_animation tool, NOT with text emotes like *waves* or *sighs*. Call [TOOL: play_animation] {\"mood\": \"...\"} [/TOOL] then reply."})
            messages += trimmed[split:]
            return messages
    messages += trimmed
    return messages


def do_chat(user_content):
    global conversation_history, key_manager, pending_shutdown
    conversation_history.append({"role": "user", "content": user_content})
    tools_used = []
    turn_msgs = build_messages()
    chat_model = config.get("chat_model", "meta-llama/llama-4-scout-17b-16e-instruct")
    max_tool_rounds = config.get("max_tool_rounds", 6)

    for _round in range(max_tool_rounds):
        while True:
            try:
                response = key_manager.current_client.chat.completions.create(
                    model=chat_model,
                    messages=turn_msgs,
                    temperature=0.85,
                    max_tokens=4096,
                )
                break
            except (RateLimitError, APIStatusError) as e:
                is_limit = isinstance(e, RateLimitError) or (hasattr(e, "status_code") and e.status_code in (429, 402, 403))
                if is_limit:
                    success, new_key_num = key_manager.rotate()
                    if success:
                        continue
                    else:
                        conversation_history.pop()
                        return {
                            "error": "all_exhausted",
                            "reply": "Hmph. All my API coins are gone. Come back with more tribute tomorrow~ 🦊💸",
                            "key_status": key_manager.status(),
                        }
                else:
                    conversation_history.pop()
                    raise

        reply = response.choices[0].message.content.strip()
        m = re.search(r'\[TOOL:\s*(\w+)\]\s*(.*?)\s*\[/TOOL\]', reply, re.DOTALL)
        if not m:
            incomplete = re.search(r'\[TOOL:\s*(\w+)\]', reply)
            if incomplete:
                turn_msgs.append({"role": "assistant", "content": reply})
                turn_msgs.append({
                    "role": "system",
                    "content": (
                        "ERROR: Your tool call is missing the closing [/TOOL] tag.\n"
                        "Correct format (entire response, no extra text):\n"
                        "[TOOL: tool_name]\n{\"arg\": \"value\"}\n[/TOOL]\n\n"
                        "Fix it now — ONLY the [TOOL:] block, nothing else."
                    )
                })
                continue
            # Fallback: detect MOOD:/ANIM:/EMOTE: in dialogue and auto-call play_animation
            mood_match = re.search(r'(?:MOOD|ANIM|EMOTE)\s*:\s*(\w[\w\s]*)', reply, re.IGNORECASE)
            if mood_match:
                raw = mood_match.group(1).strip()
                mood_key = raw.lower().split()[0] if raw else ""
                candidates = mood_to_anims.get(mood_key, [])
                available = [f for f in candidates if f in anim_cache]
                anim_file = random.choice(available) if available else None
                if anim_file:
                    fbx_data = anim_cache.get(anim_file)
                    if fbx_data:
                        vrm_send({"type": "play_animation", "name": anim_file, "data": fbx_data})
                        tools_used.append({"name": "play_animation", "args": {"mood": mood_key}})

            conversation_history.append({"role": "assistant", "content": reply})
            result = {
                "reply": reply,
                "key_status": key_manager.status(),
                "rotated": False,
                "tools_used": tools_used,
            }
            if pending_shutdown and pending_shutdown["status"] == "initiated":
                result["shutdown_active"] = True
                result["shutdown_remaining"] = max(0, int(pending_shutdown["expires_at"] - time.time()))
            return result

        tool_name = m.group(1)
        args_text = m.group(2).strip()
        turn_msgs.append({"role": "assistant", "content": reply})

        tool_settings = config.get("tools_enabled", {})
        if not tool_settings.get(tool_name, True):
            turn_msgs.append({
                "role": "system",
                "content": f"Tool '{tool_name}' is disabled. Reply in character."
            })
            continue

        tool_args = _parse_tool_args(args_text)
        tool_result = execute_tool(tool_name, tool_args)
        tools_used.append({"name": tool_name, "args": tool_args})

        if tool_name == "play_animation":
            # Force one final API call for the reply — no more tools allowed
            turn_msgs.append({
                "role": "system",
                "content": (
                    f"Tool '{tool_name}' executed. Result:\n{tool_result[:6000]}\n\n"
                    "Animation done! Now write your in-character reply to Bilgin. Do NOT call any more tools."
                )
            })
            try:
                for _ in range(3):
                    try:
                        resp = key_manager.current_client.chat.completions.create(
                            model=chat_model, messages=turn_msgs, temperature=0.85, max_tokens=4096,
                        )
                        break
                    except (RateLimitError, APIStatusError) as e:
                        if isinstance(e, RateLimitError) or (hasattr(e, "status_code") and e.status_code in (429, 402, 403)):
                            if key_manager.rotate()[0]:
                                continue
                        raise
                else:
                    raise Exception("All keys exhausted")
                reply = resp.choices[0].message.content.strip()
                reply = re.sub(r'\[TOOL:.*?\[/TOOL\]', '', reply, flags=re.DOTALL).strip()
                if not reply:
                    reply = "Hmph. What was I saying? Got distracted by my own fabulousness."
            except Exception:
                reply = "Hmph. Got distracted mid-pose. You were saying?"
            conversation_history.append({"role": "assistant", "content": reply})
            result = {"reply": reply, "key_status": key_manager.status(), "rotated": False, "tools_used": tools_used}
            if pending_shutdown and pending_shutdown["status"] == "initiated":
                result["shutdown_active"] = True
                result["shutdown_remaining"] = max(0, int(pending_shutdown["expires_at"] - time.time()))
            return result

        turn_msgs.append({
            "role": "system",
            "content": (
                f"Tool '{tool_name}' executed. Result:\n{tool_result[:6000]}\n\n"
                "IMPORTANT: If you still need to do more actions, call the next tool now. "
                "Only when everything is done, write your in-character reply."
            )
        })

    fallback_reply = "Hmph. Got tangled up in my own tricks. Try again?"
    conversation_history.append({"role": "assistant", "content": fallback_reply})
    result = {
        "reply": fallback_reply,
        "key_status": key_manager.status(),
        "rotated": False,
        "tools_used": tools_used,
    }
    if pending_shutdown and pending_shutdown["status"] == "initiated":
        result["shutdown_active"] = True
        result["shutdown_remaining"] = max(0, int(pending_shutdown["expires_at"] - time.time()))
    return result


# ════════════════════════════════════════════════════════════════
# FLASK APPLICATION
# ════════════════════════════════════════════════════════════════

app = Flask(__name__)

@app.route("/")
def index():
    return VRM_VIEWER_HTML


@app.route("/chat")
def chat_page():
    return RIKO_CHAT_HTML


@app.route("/remote")
def remote_page():
    return MOBILE_REMOTE_HTML


@app.route("/api/setup", methods=["POST"])
def api_setup():
    global key_manager, conversation_history
    data = request.json
    keys = [k.strip() for k in data.get("keys", []) if k.strip()]
    if not keys:
        return jsonify({"error": "No API keys provided"}), 400
    key_manager = KeyManager(keys)
    conversation_history = []
    config.set("saved_keys", keys)
    return jsonify({"ok": True, "key_count": len(keys)})


@app.route("/api/chat", methods=["POST"])
def api_chat():
    global key_manager
    if key_manager is None:
        return jsonify({"error": "not_setup", "message": "Add your API keys first!"}), 400
    data = request.json
    text = data.get("text", "").strip()
    images = data.get("images", [])
    if not text and not images:
        return jsonify({"error": "empty"}), 400
    if images:
        content = []
        for img in images:
            content.append({"type": "image_url", "image_url": {"url": f"data:{img['mime']};base64,{img['data']}"}})
        if text:
            content.append({"type": "text", "text": text})
    else:
        content = text
    try:
        result = do_chat(content)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "api_error", "message": str(e)}), 500


@app.route("/api/history", methods=["GET"])
def api_history():
    return jsonify({"history": conversation_history})


@app.route("/api/history", methods=["DELETE"])
def api_clear_history():
    global conversation_history
    conversation_history = []
    return jsonify({"ok": True})


@app.route("/api/keys/reset", methods=["POST"])
def api_reset_keys():
    if key_manager:
        key_manager.reset()
        return jsonify({"ok": True, "key_status": key_manager.status()})
    return jsonify({"error": "not_setup"}), 400


@app.route("/api/tools", methods=["GET"])
def api_get_tools():
    ts = config.get("tools_enabled", {})
    return jsonify({k: bool(v) for k, v in ts.items()})


@app.route("/api/tools", methods=["POST"])
def api_set_tools():
    data = request.json or {}
    ts = config.get("tools_enabled", {})
    changed = False
    for name, enabled in data.items():
        if name in ts:
            ts[name] = bool(enabled)
            changed = True
    if changed:
        config.set("tools_enabled", ts)
    return jsonify({"ok": True, "settings": {k: bool(v) for k, v in ts.items()}})


@app.route("/api/pending", methods=["GET"])
def api_get_pending():
    msgs = list(pending_messages)
    pending_messages.clear()
    return jsonify({"messages": msgs})


@app.route("/api/status", methods=["GET"])
def api_status():
    if key_manager is None:
        return jsonify({"setup": False})
    return jsonify({"setup": True, "key_status": key_manager.status()})


@app.route("/api/shutdown/status", methods=["GET"])
def api_shutdown_status():
    if not pending_shutdown:
        return jsonify({"active": False})
    remaining = max(0, int(pending_shutdown["expires_at"] - time.time()))
    return jsonify({
        "active": pending_shutdown["status"] == "initiated",
        "status": pending_shutdown["status"],
        "remaining": remaining,
    })


@app.route("/api/config", methods=["GET"])
def api_get_config():
    return jsonify(config.get_all())


@app.route("/api/config", methods=["POST"])
def api_set_config():
    data = request.json or {}
    config.set_many(data)
    return jsonify({"ok": True})


@app.route("/api/animations", methods=["GET"])
def api_animations():
    try:
        files = sorted(f for f in os.listdir("animPresets") if f.endswith(".fbx"))
        return jsonify(files)
    except OSError:
        return jsonify([])

@app.route("/<path:filename>")
def static_files(filename):
    safe_dirs = {"animPresets", "waifuModels", "legacyWaifuModels"}
    parts = filename.split("/")
    if parts[0] in safe_dirs:
        return send_from_directory(".", filename)
    return jsonify({"error": "not found"}), 404


# ════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ════════════════════════════════════════════════════════════════

def start_vrm_server(ws_port: int):
    asyncio.run(start_vrm_ws_server(ws_port))


def main():
    global key_manager
    web_port = config.get("web_port", 5000)
    ws_port = config.get("ws_port", 8766)

    # Auto-restore saved API keys
    saved = config.get("saved_keys", [])
    if saved:
        key_manager = KeyManager(saved)
        print(f"  🔑 Restored {len(saved)} saved API key(s)")

    # Preload all FBX animations into memory
    try:
        for f in os.listdir("animPresets"):
            if f.endswith(".fbx"):
                with open(os.path.join("animPresets", f), "rb") as fh:
                    anim_cache[f] = base64.b64encode(fh.read()).decode("ascii")
        if anim_cache:
            print(f"  🎬 Preloaded {len(anim_cache)} animation(s)")
    except Exception as e:
        print(f"  ⚠ Animation preload: {e}")

    print("=" * 50)
    print("  🦊 mako — AI Kitsune Companion")
    print("=" * 50)
    print(f"  Web UI:        http://localhost:{web_port}")
    print(f"  Remote Access: http://localhost:{web_port}/remote")
    print(f"  VRM WebSocket: ws://localhost:{ws_port}")
    print("=" * 50)

    # Start VRM WebSocket server in daemon thread
    ws_thread = threading.Thread(target=start_vrm_server, args=(ws_port,), daemon=True)
    ws_thread.start()

    # Give WS server a moment to start
    time.sleep(0.5)

    # Open browser windows
    webbrowser.open(f"http://localhost:{web_port}")

    # Start Flask
    try:
        app.run(host="0.0.0.0", port=web_port, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        print("\nServer shutting down.")
    except Exception as e:
        print(f"\nError: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    main()
