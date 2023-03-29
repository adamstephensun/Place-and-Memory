import './style.css'
import * as THREE from 'three'
import * as dat from 'lil-gui'
import * as CANNON from 'cannon-es'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import CannonDebugger from 'cannon-es-debugger'

// vars /-/-/-/-/-/-/-/
let helvetikerFont, loraFont, spaceMonoFont, fontsLoaded
let world, defaultMaterial, defaultContactMaterial, stonePhysMaterial, stoneContactMaterial, cannonDebugger
let activeCamera
let minX, maxX, minY, maxY  //Stores the min and max X and Y world postions of the edges of the screen

const fontsToLoad = 3

var useOrtho = true
var fontLoadFlag = false

const objectsToUpdate = []
const fonts = []
const letters  = []

const sizes = { width: window.innerWidth, height: window.innerHeight}
const aspectRatio = sizes.width / sizes.height
const mouse = new THREE.Vector2()

const parameters = {
    toggleCam: () => {
        useOrtho = !useOrtho
        updateCamType()
    },
    earthquake: () => {
        earthquake()
    },
    randomise: () => {
        resetAll()
    },
    connectWebUSB: () => {
        clickConnectWebUSB()
    },
    sendWebUSB: () => {
        clickSendWebUSB()
    },
    cannonDebugEnabled: false,
    typeInput: false,
    mouseGravity: false,
    MBGravity: false,
    earthquakeForce: 5,
    gravityLimit: 1
}

const colours = [
    new THREE.Color(0x354544),  // grey green
    new THREE.Color(0x3C680F),  // verdant green
    new THREE.Color(0x245F1F),  // letter green
    new THREE.Color(0x201E5D),  // dark purple
    new THREE.Color(0x5D2548),  // strong purple
    new THREE.Color(0x773F86),  // medium purple
    new THREE.Color(0x484677),  // light purple
    new THREE.Color(0xC34B78),  // strong pink
    new THREE.Color(0x1D5B66),  // teal
    new THREE.Color(0x1F7DB3),  // lighter blue
    //new THREE.Color(0x1B273F),  // darkish blue
    new THREE.Color(0x6C462F),  // brown
    new THREE.Color(0xE96D13),  // nba orange
    new THREE.Color(0x6C462F)   //nba purple
]

const bgColours = [
    new THREE.Color(0xBEB3B1),
    new THREE.Color(0xC3BBB0),
    new THREE.Color(0xCAC9C5),
    new THREE.Color(0x1B273F)
]

const xPositions = [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1]   //List of x positions to cycle through when spawning letters with type input

// render /-/-/-/-/-/-/-/

const canvas = document.querySelector('canvas.webgl')
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// scene and cameras /-/-/-/-/-/-/-/

const scene = new THREE.Scene()
scene.background = getRandomBGColour()

const orthoCamera = new THREE.OrthographicCamera(-1 * aspectRatio, 1 * aspectRatio, 1, -1, 0.1, 2)
scene.add(orthoCamera)
orthoCamera.position.set(0, 0, 1)

const perspectiveCamera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
perspectiveCamera.position.set(- 3, 5, 3)
scene.add(perspectiveCamera)

if(useOrtho) activeCamera = orthoCamera
else activeCamera = perspectiveCamera

const controls = new OrbitControls(perspectiveCamera, canvas)
controls.enableDamping = true

// lights /-/-/-/-/-/-/-/
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
scene.add(ambientLight)

// loaders /-/-/-/-/-/-/-/
const fontLoader = new FontLoader()

const mat = new THREE.MeshBasicMaterial({ color: colours[2] })

// init calls /-/-/-/-/-/-/-/
initPhysics()
loadFonts()

// Sounds /////
const hitSound = new Audio('/sounds/hit.mp3')

const playHitSound = (collision) =>
{
    const impactStrength = collision.contact.getImpactVelocityAlongNormal()

    if(impactStrength > 1.5)
    {
        hitSound.volume = Math.random()
        hitSound.currentTime = 0
        hitSound.play()
    }
}

// debug /-/-/-/-/-/-/-/
const gui = new dat.GUI()

gui.add(parameters, 'earthquake')
gui.add(parameters, 'toggleCam')
gui.add(parameters, 'randomise')
gui.add(parameters, "connectWebUSB")
gui.add(parameters, "sendWebUSB")
gui.add(parameters, 'cannonDebugEnabled')
gui.add(parameters, 'typeInput')
gui.add(parameters, 'mouseGravity').onChange( function(){setGravity(0,-1)})  // reset the gravity to default when toggled
gui.add(parameters, 'MBGravity').onChange( function(){setGravity(0,-1)})
gui.add(parameters, 'earthquakeForce').min(0).max(10).step(1)
gui.add(parameters, 'gravityLimit').min(0).max(10).step(1)

function initPhysics(){
    // Physics /////
    world = new CANNON.World()
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.allowSleep = true
    setGravity(0, 0)

    defaultMaterial = new CANNON.Material('default')
    defaultContactMaterial = new CANNON.ContactMaterial(
        defaultMaterial,
        defaultMaterial,
        {
            friction: 0.1,
            restitution: 0.7
        }
    )
    world.defaultContactMaterial = defaultContactMaterial

    stonePhysMaterial = new CANNON.Material('stone')
    stoneContactMaterial = new CANNON.ContactMaterial(
        defaultMaterial,
        stonePhysMaterial,
        {
            friction: 1,
            restitution: 0
        }
    )
    world.addContactMaterial(stoneContactMaterial)

    cannonDebugger = new CannonDebugger(scene, world)
}

function onFontsLoaded(){
    if(!parameters.typeInput){
        createLetter("P", getRandomFont(), new THREE.Vector3(-1.2, 0, 0))
        //createLetter("h", getRandomFont(), new THREE.Vector3(0, 0, 0))
        //createLetter("o", getRandomFont(), new THREE.Vector3(0.2, 0, 0))
        //createLetter("e", getRandomFont(), new THREE.Vector3(0.2, 0, 0))
        //createLetter("n", getRandomFont(), new THREE.Vector3(0.2, 0, 0))
        //createLetter("i", getRandomFont(), new THREE.Vector3(0.2, 0, 0))
        //createLetter("x", getRandomFont(), new THREE.Vector3(0.2, 0, 0))

    }
}

function loadFonts(){   // load and store all fonts, called once
    fontsLoaded = 0
    fontLoadFlag = false
    fontLoader.load("fonts/helvetiker_regular.typeface.json", (font) => {
        console.log('Helvetiker font loaded')
    
        helvetikerFont = font
        fonts.push(helvetikerFont)
        fontsLoaded++
        if(fontsLoaded == fontsToLoad) fontLoadFlag = true
    })

    fontLoader.load("fonts/Lora_Regular.json", (font) => {
        console.log("Lora font loaded")

        loraFont = font
        fonts.push(loraFont)
        fontsLoaded++
        if(fontsLoaded == fontsToLoad) fontLoadFlag = true
    })

    fontLoader.load("fonts/Space Mono_Regular.json", (font) => {
        console.log("Space mono font loaded")

        spaceMonoFont = font
        fonts.push(spaceMonoFont)
        fontsLoaded++
        if(fontsLoaded == fontsToLoad) fontLoadFlag = true
    })
}

var letterSpawnCount = 0
function createLetter(textString, font, position){
    const size = 0.35
    const textGeometry = new TextGeometry(
        textString,
        {
            font: font,
            size: size,
            height: 0.02,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.001,
            bevelSize: 0.002,
            bevelOffset: 0,
            bevelSegments: 5
        }
    )
    textGeometry.computeBoundingBox()
    textGeometry.center()

    const mat = new THREE.MeshBasicMaterial( { color: getRandomColour() })
    
    const mesh = new THREE.Mesh(textGeometry, mat)
    mesh.name = textString + "_letter"
    mesh.position.x = xPositions[letterSpawnCount]
    letters.push(mesh)
    scene.add(mesh)

    var start = new THREE.Vector3()
    start.copy(mesh.position)
    mesh.userData = { letter: textString, startPos: start }
 
    letterSpawnCount++
    if(letterSpawnCount > xPositions.length) letterSpawnCount = 0
    
    const helper = new THREE.Box3Helper(textGeometry.boundingBox)
    //scene.add(helper)
    helper.name = textString + "_helper"

    const body = new CANNON.Body({
        mass: rand(1,5),
        angularFactor: new CANNON.Vec3(0,0,1),      //Restricts rotation on x and y axis
        linearFactor: new CANNON.Vec3( 1, 1, 0),     //Restricts movement on z axis 
        angularDamping: 0.7,
        
    })
    body.addShape(
        new CANNON.Box( new CANNON.Vec3(size/4, size/2, size/2)) 
    )

    body.userData = { obj: mesh }

    body.position.copy(mesh.position)
    world.addBody(body)
    objectsToUpdate.push({ mesh, body })

    //body.addEventListener('collide', edgeCollision)
}

// function to create each letter, 
// create physics body in function body, switch(font){ add shapes based on font }.
// Most fonts will be similar enough to use the same shapes
// master function createLetter() that calls baby functions

function createP(font){
     
}

var offset = 0  //offset the edges from the edge of the screen. positive value (0.2) = gap between screen edge and box edge

calculateScreenEdgePositon()
createStaticBox(new THREE.Vector3(0   , maxY - offset, 0), new THREE.Vector3(maxX*2 , 0.01    , 1), false)  // Top
createStaticBox(new THREE.Vector3(maxX - offset, 0   , 0), new THREE.Vector3(0.01    , maxY*2 , 1), true)   // Right
createStaticBox(new THREE.Vector3(0   , minY + offset, 0), new THREE.Vector3(maxX*2 , 0.01    , 1), false)  // Bottom
createStaticBox(new THREE.Vector3(minX + offset, 0   , 0), new THREE.Vector3(0.01    , maxY*2 , 1), true)   // Left

function calculateScreenEdgePositon(){
    // Create a vector for each corner of the screen
    var topLeft = new THREE.Vector3(-1, 1, 0);
    var topRight = new THREE.Vector3(1, 1, 0);
    var bottomLeft = new THREE.Vector3(-1, -1, 0);
    var bottomRight = new THREE.Vector3(1, -1, 0);

    // Create a raycaster object
    var raycaster = new THREE.Raycaster();

    // Use the raycaster to get the world position of each screen corner
    raycaster.setFromCamera(topLeft, activeCamera);
    var worldTopLeft = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldTopLeft);
    raycaster.setFromCamera(topRight, activeCamera);
    var worldTopRight = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldTopRight);
    raycaster.setFromCamera(bottomLeft, activeCamera);
    var worldBottomLeft = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldBottomLeft);
    raycaster.setFromCamera(bottomRight, activeCamera);
    var worldBottomRight = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, -1)), worldBottomRight);

    // Get the screen edges by taking the minimum and maximum values of the x and y coordinates
    minX = Math.min(worldTopLeft.x, worldTopRight.x, worldBottomLeft.x, worldBottomRight.x);
    maxX = Math.max(worldTopLeft.x, worldTopRight.x, worldBottomLeft.x, worldBottomRight.x);
    minY = Math.min(worldTopLeft.y, worldTopRight.y, worldBottomLeft.y, worldBottomRight.y);
    maxY = Math.max(worldTopLeft.y, worldTopRight.y, worldBottomLeft.y, worldBottomRight.y);

    // Log the screen edges
    //console.log("Min X:", minX);
    //console.log("Max X:", maxX);
    //console.log("Min Y:", minY);
    //console.log("Max Y:", maxY);

}

function createStaticBox(position, size = {x:1, y:1, z:1}, vertical){
    const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z)
    const boxMesh = new THREE.Mesh(boxGeo, mat)

    boxMesh.position.copy(position)
    boxMesh.name = "static_box"
    scene.add(boxMesh)

    const body = new CANNON.Body({
        mass: 0
    })
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)))
    body.position.copy(position)
    world.addBody(body)

    body.addEventListener('collide', edgeCollision)
}

function edgeCollision(collision){
    console.log(collision.contact)
    let velocity = collision.contact.getImpactVelocityAlongNormal()
   
    let position = new THREE.Vector3(collision.contact.bi.position.x + collision.contact.ri.x, collision.contact.bi.position.y + collision.contact.ri.y, 0) // world position of impact

    const geo = new THREE.SphereGeometry(velocity/15)
    const mesh = new THREE.Mesh(geo, new THREE.MeshNormalMaterial())
    mesh.position.set(position.x, position.y, 0)
    scene.add(mesh)

    //calculate which led to light up using position
    //send message to microbit with LED index and brightness (just index to begin)

    if(collision.contact.bi.userData != null){
        var collisionObj = collision.contact.bi.userData.obj
        console.log(collisionObj)

        var colour = collisionObj.material.color
        
        //sendCollisionMessage(colour, 10, 255)
    }
    else{
        console.log("no user data")
    }
}

function sendCollisionMessage(col, position, intensity){
    console.log("Send collision message. r: " + col.r + "  g: " + col.g + " b: " + col.b + " pos: " + position + " intensity: " + intensity)

    uBitSend(connectedDevices[0], "r" + col.r + ",")          // green
    uBitSend(connectedDevices[0], "g" + col.g + ",")          // green
    uBitSend(connectedDevices[0], "b" + col.b + ",")          // green
    uBitSend(connectedDevices[0], "p" + position + ",")          // green
    uBitSend(connectedDevices[0], "i" + intensity + ",")          // green
    uBitSend(connectedDevices[0], "s" + 1 + ",")          // green

    //uBitSend(connectedDevices[0], col.r + ",")          // red
    //uBitSend(connectedDevices[0], col.g + ",")          // green
    //uBitSend(connectedDevices[0], col.b + ":")          // blue
    //uBitSend(connectedDevices[0], position + ".")       // LED index
    //uBitSend(connectedDevices[0], intensity + "#")      // intensity
    //uBitSend(connectedDevices[0], "1|")                 // draw to LED strip
}

function earthquake(){
    var impulse = new THREE.Vector3()
    objectsToUpdate.forEach(element => {
        impulse = new THREE.Vector3(rand(-parameters.earthquakeForce,parameters.earthquakeForce), rand(5,parameters.earthquakeForce), 0)
        element.body.applyImpulse( impulse, CANNON.Vec3.ZERO )
    });
}

function resetLetterPosition(){
    for(var i = 0; i < letters.length ; i++){
        var pos = objectsToUpdate[i].mesh.userData.startPos
        objectsToUpdate[i].body.position.set(pos.x, pos.y, pos.z)
        objectsToUpdate[i].body.velocity.set(0,0,0)
        objectsToUpdate[i].body.quaternion.setFromEuler(0,0,0, 'XYZ')
    }
}

// Update /////
const clock = new THREE.Clock()
let oldElapsedTime = 0

const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - oldElapsedTime
    oldElapsedTime = elapsedTime

    if(fontLoadFlag){
        onFontsLoaded()
        fontLoadFlag = false
    }


    // Update physics
    world.step(1 / 60, deltaTime, 3)
    if(objectsToUpdate.length > 0){
        //console.log(objectsToUpdate)
    }
    for(const object of objectsToUpdate)
    {
        object.mesh.position.set(object.body.position.x, object.body.position.y, 0)
        object.mesh.quaternion.copy(object.body.quaternion)
    }

    if(parameters.cannonDebugEnabled) cannonDebugger.update()

    // Render
    renderer.render(scene, activeCamera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()

function rand(min, max){    // inclusive
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function updateCamType(){

    if(useOrtho){    // true == use orthographic camera
        activeCamera = orthoCamera
    }
    else{               // Use perspective camera with orbit controls
        activeCamera = perspectiveCamera
    }
}

function getRandomColour(){
    var rand = Math.floor(Math.random() * Object.keys(colours).length)
    var randColour = colours[Object.keys(colours)[rand]]
    return randColour
}

function getRandomFont(){
    var rand = Math.floor(Math.random() * fonts.length )
    return fonts[rand]
}

function getRandomBGColour(){
    var rand = Math.floor(Math.random() * Object.keys(bgColours).length)
    var randColour = bgColours[Object.keys(bgColours)[rand]]
    return randColour
}

function resetAll(){
    resetLetterPosition()
    randomiseAllFonts()
    randomiseAllColours()
}

function randomiseAllFonts(){
    letters.forEach(element => {

        let newGeo = new TextGeometry(
            element.userData.letter,
            {
                font: getRandomFont(),
                size: 0.35,
                height: 0.02,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 0.001,
                bevelSize: 0.002,
                bevelOffset: 0,
                bevelSegments: 5
            }
        )
        newGeo.computeBoundingBox()
        newGeo.center()
        
        element.geometry.dispose()
        element.geometry = newGeo
    });
}

function randomiseAllColours(){
    letters.forEach(element => {
        let newMat = new THREE.MeshBasicMaterial( { color: getRandomColour() })

        element.material.dispose()
        element.material = newMat
    });
}

function setGravity(x, y){
    world.gravity.set(x,y,0)
    //console.log("Gravity set to x: " + x + "  y: " + y)
}

// Events /////
window.addEventListener('keydown', function(event) {
    console.log(event.key.charCodeAt(0))
    if(event.key.charCodeAt(0) >= 97 && event.key.charCodeAt(0) <= 122){    //If input is a letter a-z (lower case)
        //createLetter(event.key, randomFont(), new THREE.Vector3(0,0,0))
    }
    else if(event.key.charCodeAt(0) >= 65 && event.key.charCodeAt(0) <= 90){    //If input is A-Z (Upper case)
        //createLetter(event.key, randomFont(), new THREE.Vector3(0,0,0))
    }
    if(parameters.typeInput) createLetter(event.key, getRandomFont(), new THREE.Vector3(0,0,0))    //if type input is enabled, create letter with the input

    if(event.key.charCodeAt(0) >= 48 && event.key.charCodeAt(0) <= 57){     // if input is a number key, send it to microbit with delimiter
        console.log("Sending keycode: " + event.key + "|")
        uBitSend(connectedDevices[0], event.key + "|")
    }

    if(event.key.charCodeAt(0) == 32){      // space bar        
        sendCollisionMessage(new THREE.Color(0.5,0.7,0.2), 10, 255)
    }
})

window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX / sizes.width * 2 - 1
    mouse.y = - (event.clientY / sizes.height) * 2 + 1

    if(parameters.mouseGravity) setGravity(mouse.x, mouse.y)
})

window.addEventListener('click', (event) => {
    //console.log("Click")
    //resetAll()
})

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    
    // Update camera
    activeCamera.aspect = sizes.width / sizes.height
    activeCamera.updateProjectionMatrix()
    
    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    calculateScreenEdgePositon()
})

///////// Microbit stuff /////////

async function clickConnectWebUSB(){
    uBitConnectDevice(uBitEventHandler)
}

async function clickSendWebUSB(){
    if(connectedDevices.length > 0){
        //uBitSend(connectedDevices[0], "toggle_send|")
    }
    else{
        console.log("No WebUSB devices connected")
    }
}

var lastGravX, lastGravY
var gravX = 0
var gravY = 0

async function parseMBData(packet){
    var data = packet.data
    var id = packet.graph

    //console.log("Received data: " + data + "  on graph: " + id) 

    switch(id){
        case "x":
            // pitch (x axis, -180 to 180)
            if(data != null) gravY = normaliseInRange(data, -180, 180, -parameters.gravityLimit, parameters.gravityLimit)
            else gravY = lastGravY

            break
        case "y":
            // roll (y axis, -180 to 180)
            if(data != null) gravX = normaliseInRange(data, -180, 180, -parameters.gravityLimit, parameters.gravityLimit)
            else gravX = lastGravX

            break
        case "z":
            // compass heading (0 to 360)
            break
        case "s":
            // shake
            resetAll()

            break
        case "a":
            // a button pressed
            earthquake()
            break
        case "b":
            // b button pressed

            break
        case "c":
            // c button pressed

            break
    }

    if(parameters.MBGravity){
        console.log("setting gravity to x: " + gravX.toFixed(2), "  y: " + gravY.toFixed(2))
        setGravity(gravX, -gravY)
    }    
    lastGravX = gravX
    lastGravY = gravY
}

var connectedDevices = []

function uBitEventHandler(reason, device, data){
    //console.log(reason, data)
    switch(reason){
        case "connected":
            console.log("USB device connected")
            connectedDevices.push(device)
            break
        case "disconnected":
            console.log("USB device disconnected")
            connectedDevices = connectedDevices.filter( v => v != device)
            break
        case "connection failure":
            console.log("USB device connection failure")
            break
        case "error":
            console.log("USB device error")
            break
        case "console":
            console.log("USB device Console Data: " + data.data)
            break
        case "graph-event":
            //console.log(`USB device Graph Event:  ${data.data} (for ${data.graph}${data.series.length?" / series "+data.series:""})`)
            break
        case "graph-data":
            //console.log(`USB Device Graph Data: ${data.data} (for ${data.graph}${data.series.length?" / series "+data.series:""})`)
            parseMBData(data)
            break
    }
}

function normaliseInRange(val, oldMin, oldMax, newMin, newMax){
    return newMin + (val - oldMin) * (newMax - newMin) / (oldMax - oldMin)
}
