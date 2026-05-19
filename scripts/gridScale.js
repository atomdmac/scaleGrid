import {
  gridUtils
} from "./gridUtils.js";

/*
**How to work with Foundry grids, a primer**

When working on the grid, you generally want to access 'canvas.grid'. That's going to be
a different object depending on which type of grid is currently selected; SquareGrid, HexagonalGrid,
or BaseGrid (gridless). 'canvas.grid' is the GridLayer, which we don't deal with here.

DIMENSIONS
The scene grid is split into outer and inner panels, with the inner panel set inside and offset
from the outer panel (usually centered).

- 'canvas.grid.options' to get the dimensions and other information about the grid
- 'canvas.dimensions' is a shortcut for 'canvas.grid.options.dimensions'

Key canvas.dimensions properties:
  - sceneHeight: (inner panel height)
  - sceneRect: {x, y, width, height} (inner panel rect)
  - sceneWidth: (inner panel width)
  - sceneX: (left inner panel offset from left outer panel)
  - sceneY: (top inner panel offset from top outer panel)
  - size: (grid cell size)

UPDATING (without saving)
Saving grid changes takes time and makes the screen flash, so when we want to make temporary
changes, like when using the adjustment dialog, we only want to update the grid settings.
  - 'canvas.grid.draw({ <options object> })' updates the grid without saving changes to the scene

SAVING
When changes to the grid need to be saved, that's done on 'scene' object, not the 'grid'.
  - 'scene.update({ <update data> })'

*/

class ScaleGridLayer extends CanvasLayer {
  constructor() {
    super();

    this.select = null;
    this.pixiGraphics = null;
    this.ogMouseCoords = null;  // original mouse coordinates
    this.cavasGridTempSettings = {};
  };

  // <================== Button Setup ====================>
  setButtons() {
    gridScaler.newButtons = {
      name: "grid",
      icon: "fas fa-border-all",
      order: 11,
      title: "Grid Controls",
      visible: true,
      onChange: () => {},
      tools: {
        DrawGridTool: {
          icon: "fas fa-square",
          name: "DrawGridTool",
          order: 2,
          title: "Set grid by drawing either a square or hexagon",
          button: true,
          onChange: gridScaler.setupDrawGrid
        },
        Draw3x3Tool: {
          icon: "fas fa-th",
          name: "Draw3x3Tool",
          order: 2,
          title: "Set grid by drawing a 3x3 box",
          button: true,
          onChange: gridScaler.setupDraw3X3
        },
        AdjustXTool: {
          icon: "fas fa-ruler-horizontal",
          name: "AdjustXTool",
          order: 4,
          title: "Set the X position of the grid",
          button: true,
          onChange: gridScaler.setupAdjustX
        },
        AdjustYTool: {
          icon: "fas fa-ruler-vertical",
          name: "AdjustYTool",
          order: 5,
          title: "Set the Y position of the grid",
          button: true,
          onChange: gridScaler.setupAdjustY
        },
        MoveGridTool: {
          icon: "fas fa-object-group",
          name: "MoveGridTool",
          order: 6,
          title: "Move and scale the grid",
          button: true,
          onChange: gridScaler.openGridMoveDialog
        },
        ManualGridSizeTool: {
          icon: 'fas fa-pen-square',
          name: "ManualGridSizeTool",
          order: 7,
          title: "Set the grid by number of squares or hexes",
          button: true,
          onChange: gridScaler.openGridSizeDialog
        },
        ToggleGridTool: {
          icon: 'fas fa-border-none',
          name: "ToggleGridTool",
          order: 8,
          title: "Toggle the grid display temporarily",
          toggle: true,
          onChange: (_, isActive) => { 
            gridScaler.toggleGrid(isActive); 
          }
        },
        ResetGridTool: {
          icon: "fas fa-undo",
          name: "ResetGridTool",
          order: 9,
          title: "Reset the grid",
          button: true,
          onChange: (e) => {
            gridScaler.resetDialog(e);
          }
        },
        dummyTool: {
          // remove select tool when foundry issue #12966 is resolved
          icon: "fa-solid fa-expand",
          name: "dummyTool",
          title: "functionless default tool", 
          order: 10,
          visible: false, 
          onChange: () => {}
        }
      },
      activeTool: "dummyTool"  // set to "" when foundry issue #12966 is resolved- currently need to specify a dummy Tool as active Tool.
    }
  }

  // <================== Listeners Section ====================>

  // From foundry.js =  this adds the mousedown/mousemove/mouseup to the canvas calls their corresponding functions.
  addListeners() {
    gridUtils.log("Add listeners");
    canvas.stage.addListener('mousedown', gridScaler.gridOnMouseDown);
  }

  // From foundry.js =  this removes the mousedown/mousemove/mouseup to the canvas and calls their corresponding functions.
  removeListeners() {
    gridUtils.log("Remove listeners");
    canvas.stage.removeListener('mousedown', gridScaler.gridOnMouseDown);
    canvas.stage.removeListener("mousemove", gridScaler.gridOnMouseMove);
    canvas.stage.removeListener("mouseup", gridScaler.gridOnMouseUp);
  }

  // Adds only the mouse move listener used to drawing the square.
  addMoveListener() {
    canvas.stage.addListener("mousemove", gridScaler.gridOnMouseMove);
    canvas.stage.addListener("mouseup", gridScaler.gridOnMouseUp);
  }

  // <================== Start Mouse Actions  ====================>

  gridOnMouseDown(evt) {
    const mousePos = gridUtils.getMousePos(evt);

    switch (gridScaler.currentTool) {
      case "DrawSquareTool":
      case "Draw3x3Tool":
      case "DrawHexTool":
        gridScaler.ogMouseCoords = mousePos;
        gridScaler.addMoveListener();
        break;
      case "AdjustXTool":
        gridScaler.setNewXOffset(mousePos);
        break;
      case "AdjustYTool":
        gridScaler.setNewYOffset(mousePos);
        break;
      case "ResetGridTool":
        break;
      default:
        //If something gets here then one or more listener enabler/disabler didnt work.
        gridScaler.removeListeners();
        gridUtils.log("&&^^NO mouse expression matched^^&&")
    }
  }

  // Should only be active for drawing the grid square. But in case it is active at some other point
  // there is an if statement that checks for the active tool and whether it needs to be drawn.
  gridOnMouseMove(_) {
    if (!gridScaler.needsDrawn) {
      return;
    }

    const ogMousePos = gridScaler.ogMouseCoords;
    const mousePos = gridUtils.getMousePos();

    if (gridScaler.currentTool == "DrawHexTool") {
      gridScaler.configureHexGrid(ogMousePos, mousePos)
    } else if (gridScaler.currentTool == "Draw3x3Tool"
      || gridScaler.currentTool == "DrawSquareTool") {
      gridScaler.configureSquareGrid(ogMousePos, mousePos)
    }
  }

  // Used after finishing drawing the square.
  async gridOnMouseUp(evt) {
    gridScaler.removeListeners();

    // Resets some things, clears the square and switch on the game listeners.
    if (gridScaler.needsDrawn == true) {
      if (gridScaler.currentTool == "DrawHexTool") {
        gridScaler.needsDrawn = false;
        await gridScaler.setHexGrid();
        gridScaler.ogMouseCoords = null;
      } else {
        gridScaler.needsDrawn = false;
        await gridScaler.setGrid();
      }
    }
  }

  // <================== Start Setup Functions  ====================>

  setupAdjustX() {
    ui.notifications.info("Click on a point to set up the X position of your grid");
    console.log("Grid Scale | Drawing Layer | Running AdjustX")
    gridScaler.currentTool = "AdjustXTool"
    gridScaler.addListeners();
  }

  setupAdjustY() {
    ui.notifications.info("Click on a point to set up the Y position of your grid");
    console.log("Grid Scale | Drawing Layer | Running AdjustY")
    gridScaler.currentTool = "AdjustYTool"
    gridScaler.addListeners();
  }

  setupDrawGrid() {
    const gridType = canvas.grid.type;

    if (gridType === 1) {
      gridScaler.setupDrawSquare();
    } else if (gridType !== 0) {
      gridScaler.setupDrawHex();
    }
  }

  setupDrawSquare() {
    ui.notifications.info("Click and drag your mouse to draw a square");
    gridScaler.currentTool = "DrawSquareTool"
    gridScaler.initializeDrawGrid();
  }

  setupDrawHex() {
    ui.notifications.info("Click and drag your mouse to draw an hexagon");
    gridScaler.currentTool = "DrawHexTool"
    gridScaler.initializeDrawGrid();
  }

  setupDraw3X3() {
    ui.notifications.info("Click and drag your mouse to draw a box of 3 squares");
    gridScaler.currentTool = "Draw3x3Tool"
    gridScaler.initializeDrawGrid();
  }

  initializeDrawGrid() {
    gridScaler.drawCoords = null;
    gridScaler.needsDrawn = true;
    canvas.stage.addListener('mousedown', gridScaler.gridOnMouseDown);
  }

  // <================== Start Pixi Setup Functions  ====================>

  initializePixi() {
    if (!gridScaler.pixiGraphics) {
      gridScaler.pixiGraphics = canvas.controls.addChild(new PIXI.Graphics());
    }
  }

  // Sets up the data for drawing the square when given mouse position. Enforces drawing a square, not a rectange.
  configureSquareGrid(ogMousePos, mousePos) {
    const size = Math.abs(ogMousePos.x - mousePos.x);
    let x = ogMousePos.x;
    let y = ogMousePos.y;

    // Make sure the square is always anchored around the original mouse click.
    if (mousePos.x < ogMousePos.x) {
      x = ogMousePos.x - size;
    }

    if (mousePos.y < ogMousePos.y) {
      y = ogMousePos.y - size;
    }

    const coords = [x, y, size, size];
    gridScaler.drawCoords = coords;
    gridScaler.drawSquareGrid(coords);
  }

  drawSquareGrid(coords) {
    gridScaler.pixiGraphics
      .clear()
      .beginFill(0x208000, 0.3)
      .lineStyle(1, 0x66ff33, .9, 0)
      .drawRect(...coords);
  }

  // Sets up the data for drawing the hex grid.
  configureHexGrid(ogMousePos, mousePos) {
    const gridType = canvas.grid.type;

    if (gridType > 1 && gridType < 4) {
      const height = Math.abs(ogMousePos.y - mousePos.y) * (ogMousePos.y < mousePos.y ? -1 : 1);
      const width = Math.abs(height) * (ogMousePos.x < mousePos.x ? -1 : 1);
      const coords = [
        ogMousePos.y > mousePos.y ? mousePos.y : ogMousePos.y,
        ogMousePos.x > mousePos.x ? mousePos.x : ogMousePos.x,
        Math.abs(height), Math.abs(width)];

      gridScaler.drawCoords = coords;
      gridScaler.drawVerticalHexGrid(coords[1], coords[0], coords[2], coords[3])
    }
    else {
      const width = Math.abs(ogMousePos.x - mousePos.x) * (ogMousePos.x < mousePos.x ? -1 : 1);
      const height = Math.abs(width) * (ogMousePos.y < mousePos.y ? -1 : 1);
      const coords = [
        ogMousePos.x > mousePos.x ? mousePos.x : ogMousePos.x,
        ogMousePos.y > mousePos.y ? mousePos.y : ogMousePos.y,
        Math.abs(width), Math.abs(height)];

      gridScaler.drawCoords = coords;
      gridScaler.drawHorizontalHexGrid(coords[0], coords[1], coords[2], coords[3])
    }
  }

  drawHorizontalHexGrid(x, y, w, h) {
    const d = w;
    const a = d / 2;
    const eH = Math.sqrt(3) / 2 * a

    // the following variables setup a flat hex when dragged sideways.
    const pt1 = [x, y]
    const pt2 = [x + (a / 2), y - eH]
    const pt3 = [x + (a / 2) + a, y - eH]
    const pt4 = [x + w, y]
    const pt5 = [x + (a / 2) + a, y + eH]
    const pt6 = [x + (a / 2), y + eH]
    const whattf = [pt1[0], pt1[1], pt2[0], pt2[1], pt3[0], pt3[1], pt4[0], pt4[1], pt5[0], pt5[1], pt6[0], pt6[1], pt1[0], pt1[1]];

    gridScaler.pixiGraphics.clear().beginFill(0x478a94, 0.3).lineStyle(1, 0x7deeff, .9, 0).drawPolygon(whattf);
  }

  drawVerticalHexGrid(x, y, w, h) {
    const d = h;
    const a = d / 2;
    const eH = Math.sqrt(3) / 2 * a
    const pt1 = [x, y]
    const pt2 = [x + eH, y + (a / 2)]
    const pt3 = [x + eH, y + (a / 2) + a]
    const pt4 = [x, y + h]
    const pt5 = [x - eH, y + (a / 2) + a]
    const pt6 = [x - eH, y + (a / 2)]
    const whattf = [pt1[0], pt1[1], pt2[0], pt2[1], pt3[0], pt3[1], pt4[0], pt4[1], pt5[0], pt5[1], pt6[0], pt6[1], pt1[0], pt1[1]];

    gridScaler.pixiGraphics.clear().beginFill(0x478a94, 0.3).lineStyle(1, 0x7deeff, .9, 0).drawPolygon(whattf);
  }

  // Used to get the side points for a hexagon based off the returned center point so that offset can be determined.
  getFlatHexPoints(x, y) {
    const curWidth = canvas.dimensions.size;
    const d = curWidth;
    const a = d / 2;
    const eH = Math.sqrt(3) / 2 * a
    const centerPoint = canvas.grid.getCenter(x, y)
    const lP = [centerPoint[0] - a, centerPoint[1]];
    const rP = [centerPoint[0] + a, centerPoint[1]];
    const bP = [centerPoint[0], centerPoint[1] + eH];
    const tP = [centerPoint[0], centerPoint[1] - eH];
    const rTP = [centerPoint[0] + (a / 2), centerPoint[1] - eH];
    const rBP = [centerPoint[0] + (a / 2), centerPoint[1] + eH];
    const lTP = [centerPoint[0] - (a / 2), centerPoint[1] - eH];
    const lBP = [centerPoint[0] - (a / 2), centerPoint[1] + eH];

    return [lP[0], lP[1], rP[0], rP[1], tP[0], tP[1], bP[0], bP[1], centerPoint[0], centerPoint[1], rTP[0], rTP[1], rBP[0], rBP[1], lTP[0], lTP[1], lBP[0], lBP[1]];
    /*
      How this determines offsets is to get the center of the clicked in hexagon. Following this it gets the current scenes grid size.
      Since we know the grid size and that a hexagon is a bunch of triangles we can calculate the points we need to determine the edges of the hexagon.
      We determine a left point (lP), right point (rP), top point (tP), and bottom point (bP). Once these points are figured out. When this is called
      the function that called it can see if the click is inside/outside of these points and adjust the grid accordingly.
    */
  }

  // Used to get the side points for a hexagon based off the returned center point so that offset can be determined.
  getPointyHexPoints(x, y) {
    const curWidth = canvas.dimensions.size;
    const d = curWidth;
    const a = d / 2;
    const eH = Math.sqrt(3) / 2 * a
    const centerPoint = canvas.grid.getCenter(x, y)
    const lP = [centerPoint[0] - eH, centerPoint[1]];
    const rP = [centerPoint[0] + eH, centerPoint[1]];
    const bP = [centerPoint[0], centerPoint[1] + a];
    const tP = [centerPoint[0], centerPoint[1] - a];
    const rTP = [centerPoint[0] + eH, centerPoint[1] - (a / 2)];
    const rBP = [centerPoint[0] + eH, centerPoint[1] + (a / 2)];
    const lTP = [centerPoint[0] + eH, centerPoint[1] - (a / 2)];
    const lBP = [centerPoint[0] + eH, centerPoint[1] + (a / 2)];

    return [lP[0], lP[1], rP[0], rP[1], tP[0], tP[1], bP[0], bP[1], centerPoint[0], centerPoint[1], rTP[0], rTP[1], rBP[0], rBP[1], lTP[0], lTP[1], lBP[0], lBP[1]];
    //tdlr need points to determine shift distance (see above ~731)
  }

  // <================== Start Grid Setting Functions  ====================>

  async setNewXOffset(mousePos) {
    const gridSize = canvas.dimensions.size;
    const gridType = canvas.grid.type;
    let offsetX = canvas.scene.background.offsetX;
    let hexPValues = null;

    switch (gridType) {
      case 1:
        const closeTopL = canvas.grid.getTopLeftPoint({ x: mousePos.x, y: mousePos.y });
        const oppX = closeTopL.x + gridSize;
        const absTopL = Math.abs(closeTopL.x - mousePos.x);
        const absTopR = Math.abs(oppX - mousePos.x);

        if (absTopL > absTopR) {
          offsetX -= Math.floor(absTopR);
          await canvas.scene.update({ "background.offsetX": offsetX });
        } else {
          offsetX += Math.floor(absTopL);
          await canvas.scene.update({ "background.offsetX": offsetX });
        }
        break;
      case 2:
      case 3:
        hexPValues = gridScaler.getPointyHexPoints(mousePos.x, mousePos.y)

        const absPL = Math.abs(hexPValues[0] - mousePos.x);
        const absPR = Math.abs(hexPValues[2] - mousePos.x);

        if (absPR < absPL) {
          offsetX -= Math.floor(absPR);
          await canvas.scene.update({ "background.offsetX": offsetX });
        } else {
          offsetX += Math.floor(absPL);
          await canvas.scene.update({ "background.offsetX": offsetX });
        }
        break;
      case 4:
      case 5:
        hexPValues = gridScaler.getFlatHexPoints(mousePos.x, mousePos.y)

        const prefSide = gridUtils.findTheBestSide(hexPValues[5], hexPValues[7], hexPValues[9], mousePos.y)

        if (prefSide == hexPValues[5]) {
          gridScaler.setHexXOffset(hexPValues[14], hexPValues[10], mousePos)
        }
        else if (prefSide == hexPValues[1]) {
          gridScaler.setHexXOffset(hexPValues[2], hexPValues[0], mousePos)
        }
        else {
          gridScaler.setHexXOffset(hexPValues[16], hexPValues[12], mousePos)
        }
        break;
      case 0:
      default:
        break;
    }
  }

  async setNewYOffset(mousePos) {
    gridScaler.removeListeners();
    const gridSize = canvas.dimensions.size;
    const offsetY = canvas.scene.background.offsetY;
    const gridType = canvas.grid.type;

    switch (gridType) {
      case 1:
        const closeTopL = canvas.grid.getTopLeftPoint({ x: mousePos.x, y: mousePos.y });
        const oppY = closeTopL.y + gridSize;
        const absTop = Math.abs(closeTopL.y - mousePos.y);
        const absBot = Math.abs(oppY - mousePos.y);

        if (absTop < absBot) {
          const yOff = offsetY + Math.floor(absTop);
          await canvas.scene.update({ "background.offsetY": yOff });
          gridUtils.logOperation("Y Offset", yOff);
        } else {
          const yOff = offsetY - Math.floor(absBot);
          await canvas.scene.update({ "background.offsetY": yOff });
          gridUtils.logOperation("Y Offset", yOff);
        }
        break;
      case 2:
      case 3:
        const hexPValues = gridScaler.getPointyHexPoints(mousePos.x, mousePos.y)
        const prefSide = gridUtils.findTheBestSide(hexPValues[0], hexPValues[8], hexPValues[2], mousePos.x)

        if (prefSide == hexPValues[0]) {
          gridScaler.setHexYOffset(hexPValues[15], hexPValues[17], mousePos)
        } else if (prefSide == hexPValues[8]) {
          gridScaler.setHexYOffset(hexPValues[5], hexPValues[7], mousePos)
        } else {
          gridScaler.setHexYOffset(hexPValues[11], hexPValues[13], mousePos)
        }
        break;
      case 4:
      case 5:
        const hexValues = gridScaler.getFlatHexPoints(mousePos.x, mousePos.y)
        const absT = Math.abs(hexValues[5] - mousePos.y);
        const absB = Math.abs(hexValues[7] - mousePos.y);

        if (absT < absB) {
          const yOff = offsetY + Math.floor(absT);
          await canvas.scene.update({ "background.offsetY": yOff });
          gridUtils.logOperation("Y Offset", yOff);
        } else {
          const yOff = offsetY - Math.floor(absB);
          await canvas.scene.update({ "background.offsetY": yOff });
          gridUtils.logOperation("Y Offset", yOff);
        }
        break;
      case 0:
      default:
        break;
    }
  }

  // Safely set the grid size for the canvas. Foundry expects the size to be an integer and at
  // least 50 pixels. If the value is less that 50, adjust the size of the map to compensate.
  async setGridSize(size) {
    const safeSize = Math.round(size);

    if (safeSize < 50) {
      const adjustedData = gridUtils.getAdjustedSceneSize(safeSize);
      await canvas.scene.update({
        width: adjustedData.sceneWidth,
        height: adjustedData.sceneHeight,
        "grid.size": size
      });
    } else {
      await canvas.scene.update({
        "grid.size": size
      });
    }
  }

  async setHexXOffset(p1, p2, mousePos) {
    const gridSize = canvas.dimensions.size;
    const magicNumber = gridUtils.findTheBest(p1, p2, mousePos.x, gridSize);
    const xOffset = canvas.scene.background.offsetX;
    const finalOffset = Math.round(xOffset + magicNumber[0]);

    await canvas.scene.update({ "background.offsetX": finalOffset });
  }

  async setHexYOffset(p1, p2, mousePos) {
    const gridSize = canvas.dimensions.size;
    const yOffset = canvas.scene.background.offsetY;
    const magicNumber = gridUtils.findTheBest(p1, p2, mousePos.y, gridSize);
    const finalOffset = Math.round(yOffset + magicNumber[0]);

    await canvas.scene.update({ "background.offsetY": finalOffset });
  }

  // Resets the grid to a 100px grid with 0 X/Y Offset.
  async resetGrid() {
    gridUtils.log("Resetting Grid");
    gridScaler.removeListeners();
    await canvas.scene.update({
      "grid.size": 100,
      "background.offsetX": 0,
      "background.offsetY": 0
    });
  }

  async setGrid() {
    gridScaler.removeListeners();
    gridScaler.pixiGraphics.clear();

    if (gridScaler.drawCoords) {
      let gridSize = gridScaler.drawCoords[3];
      let sceneWidth = canvas.dimensions.sceneWidth;
      let sceneHeight = canvas.dimensions.sceneHeight;

      if (gridScaler.currentTool == "Draw3x3Tool") {
        gridSize /= 3;
      }

      // If the grid size ends up being less than 50 we need to make it 50 and adjust 
      // the scene (map) size to compensate. Foundry doesn't accept grid sizes less than 50.
      if (gridSize < 50) {
        gridUtils.logOperation("Adjusting grid size", gridSize)
        const adjustedData = gridUtils.getAdjustedSceneSize(gridSize);
        gridSize = adjustedData.size;
        sceneWidth = adjustedData.sceneWidth;
        sceneHeight = adjustedData.sceneHeight;
      }

      // Get the mouse position relative to the scene and then calculate how much to 
      // move the background to match the new grid.
      const sceneMouseX = gridScaler.drawCoords[0] - canvas.dimensions.sceneX;
      const sceneMouseY = gridScaler.drawCoords[1] - canvas.dimensions.sceneY;
      const offsetX = (sceneMouseX - (Math.trunc(sceneMouseX / gridSize) * gridSize));
      const offsetY = (sceneMouseY - (Math.trunc(sceneMouseY / gridSize) * gridSize));

      // Update the scene with the new data.
      await canvas.scene.update({
        "grid.size": Math.round(gridSize),
        background: {
          offsetX: offsetX,
          offsetY: offsetY,
        },
        width: Math.round(sceneWidth),
        height: Math.round(sceneHeight)
      });
    }

    gridScaler.currentTool = null;
  }

  // Sets the grid, with appropriate offset.
  // Usual hex information for coming up with hex part ratios: https://hexagoncalculator.apphb.com/
  //  --  Edge length: 0.5
  // /  \
  // \  / Diameter (point to point): 1
  //  --  Top to bottom length: 0.866
  async setHexGrid(_) {
    gridScaler.removeListeners();
    gridScaler.pixiGraphics.clear();

    if (gridScaler.drawCoords) {
      const gridType = canvas.grid.type;
      let gridSize = gridScaler.drawCoords[3];
      let sceneWidth = canvas.dimensions.sceneWidth;
      let sceneHeight = canvas.dimensions.sceneHeight;
      let adjustmentRatio = 1;

      // If the grid size ends up being less than 50 we need to make it 50 and adjust 
      // the scene (map) size to compensate. Foundry doesn't accept grid sizes less than 50.
      if (gridSize < 50) {
        const adjustedData = gridUtils.getAdjustedSceneSize(gridSize);
        adjustmentRatio = adjustedData.adjustment;
        gridSize = adjustedData.size;
        sceneWidth = adjustedData.sceneWidth;
        sceneHeight = adjustedData.sceneHeight;
      }

      let gridX = gridScaler.drawCoords[0];
      let gridY = gridScaler.drawCoords[1];

      let tempGridSize = gridSize * 0.8660258075690656;

      // Go left and up from the top left of the box until we pass the left/top side 
      // of the scene. That'll be the amount we need to shift the grid by.
      let moveCount = 0;

      while (gridX > 0) {
        if (gridType == 2 || gridType == 3) {
          gridX -= tempGridSize;
        } else {
          moveCount++;
          gridX -= gridSize / 4
        }
      }

      while (gridY > 0) {
        if (gridType == 2 || gridType == 3) {
          gridY -= gridSize;
        } else {
          gridY -= tempGridSize;
        }
      }

      let offsetX = gridX;
      let offsetY = gridY;

      // We know the shift values are negative at this point, but check to see if 
      // it makes sense to switch to a smaller positive offset instead.
      if (gridSize - Math.abs(gridX) < Math.abs(gridX)) {
        offsetX = gridSize + gridX;
      }

      if (gridSize - Math.abs(gridY) < Math.abs(gridY)) {
        offsetY = gridSize + gridY;
      }

      offsetX = gridX - ((gridSize / 4) * (moveCount % 4));

      console.log(`size: ${gridSize}`);
      console.log(`shift X:${offsetX} Y:${offsetY}`);
      console.log(`modulo: ${moveCount % 4}`);

      // Update the scene with the new data.
      const gridData = {
        "grid.size": Math.round(gridSize),
        background: {
          offsetX: Math.round(offsetX),
          offsetY: Math.round(offsetY),
        },
        width: Math.round(sceneWidth),
        height: Math.round(sceneHeight)
      }

      await canvas.scene.update(gridData);
    }

    gridScaler.currentTool = null;
  }

  // <================== Dialogs  ====================>

  async openGridMoveDialog() {
    const templatePath = 'modules/scaleGrid/templates/gridMove.html';
    const html = await foundry.applications.handlebars.renderTemplate(templatePath, null);
    let offsetX = 0;
    let offsetY = 0;

    // Use the grid toggle code to make the grid temporarily visible.
    gridScaler.cavasGridTempSettings[canvas.scene.id] = null;
    gridScaler.toggleGrid();

    // In V14, canvas.dimensions.sceneX is pure padding and does not include
    // background.offsetX, but the background sprite is positioned at
    // sceneX + background.offsetX. Sync them so refreshGrid's bg.position.set()
    // starts from the correct position instead of jumping on first button press.
    const bgSprite = canvas.primary?.background;
    if (bgSprite) {
      canvas.dimensions.sceneX = bgSprite.position.x;
      canvas.dimensions.sceneY = bgSprite.position.y;
    }

    foundry.applications.api.DialogV2.wait({
      window: { title: "Move and Scale Grid" },
      content: html,
      buttons: [
        {
          type: "button",
          action: "save",
          label: "Save Changes",
          icon: "fas fa-save",
          default: true,
          callback: async (event, button, dialog) => {
            let sceneWidth = canvas.dimensions.sceneWidth;
            let sceneHeight = canvas.dimensions.sceneHeight;
            let gridSize = canvas.dimensions.size;

            // If the grid size ends up being less than 50 we need to make it 50 and adjust
            // the scene (map) size to compensate. Foundry doesn't accept grid sizes less than 50.
            if (gridSize < 50) {
              gridUtils.logOperation("Adjusting grid size", gridSize)
              const adjustedData = gridUtils.getAdjustedSceneSize(gridSize);
              gridSize = adjustedData.size;
              sceneWidth = adjustedData.sceneWidth;
              sceneHeight = adjustedData.sceneHeight;
            }

            await canvas.scene.update({
              "grid.size": gridSize,
              background: {
                offsetX: Math.round(canvas.scene.background.offsetX - offsetX),
                offsetY: Math.round(canvas.scene.background.offsetY - offsetY),
              },
              width: Math.round(sceneWidth),
              height: Math.round(sceneHeight)
            });
          }
        },
        {
          type: "button",
          action: "reset",
          label: "Discard Changes",
          icon: "fas fa-sync",
          callback: async (event, button, dialog) => {
            await canvas.draw();
          }
        }
      ],
      render: (event, dialog) => {
        let interval;
        const element = dialog.element;

        element.querySelector("#move-right").addEventListener("mousedown", () => {
          interval = setInterval(() => {
            offsetX -= 1;
            gridUtils.refreshGrid({ background: true, offsetX: -1, offsetY: 0, offsetSize: 0 })
          }, 50);
        });
        element.querySelector("#move-left").addEventListener("mousedown", () => {
          interval = setInterval(() => {
            offsetX += 1;
            gridUtils.refreshGrid({ background: true, offsetX: 1, offsetY: 0, offsetSize: 0 })
          }, 50);
        });
        element.querySelector("#move-up").addEventListener("mousedown", () => {
          interval = setInterval(() => {
            offsetY += 1;
            gridUtils.refreshGrid({ background: true, offsetX: 0, offsetY: 1, offsetSize: 0 })
          }, 50);
        });
        element.querySelector("#move-down").addEventListener("mousedown", () => {
          interval = setInterval(() => {
            offsetY -= 1;
            gridUtils.refreshGrid({ background: true, offsetX: 0, offsetY: -1, offsetSize: 0 })
          }, 50);
        });
        element.querySelector("#expand-grid").addEventListener("mousedown", () => {
          interval = gridScaler.repeatResizeGridWithBackgroundOffset(1);
        });
        element.querySelector("#contract-grid").addEventListener("mousedown", () => {
          interval = gridScaler.repeatResizeGridWithBackgroundOffset(-1);
        });

        const clearOnMouseUp = () => clearInterval(interval);
        ["#move-right", "#move-left", "#move-up", "#move-down", "#expand-grid", "#contract-grid"].forEach(selector => {
          element.querySelector(selector).addEventListener("mouseup", clearOnMouseUp);
        });
      },
      close: (event, dialog) => {
        gridScaler.toggleGrid();
      },
      rejectClose: false
    });
  }

  // We want the background to stay relative to the grid cell it started in as the grid size is changing.
  // So we compare the old snap position to the new one, after the grid size has changed, and apply
  // the offset. We also don't want the background drifting too far, so sometimes we'll snap it to a new
  // grid cell.
  repeatResizeGridWithBackgroundOffset(gridOffset) {
    let ogSceneX = canvas.dimensions.sceneX;
    let ogGridSize = canvas.dimensions.size;

    return setInterval(() => {
      const sceneX = canvas.dimensions.sceneX;
      const sceneY = canvas.dimensions.sceneY;
      const snapPos = canvas.grid.getSnappedPoint(new PIXI.Point(sceneX, sceneY), { mode: CONST.GRID_SNAPPING_MODES.CENTER });

      gridUtils.refreshGrid({ background: true, offsetX: 0, offsetY: 0, offsetSize: gridOffset })

      if (gridOffset == 1 && sceneX - ogSceneX > ogGridSize) {
        const gridSize = canvas.dimensions.size;
        gridScaler.refreshGridForResize(snapPos, -gridSize)

        ogSceneX = sceneX;
        ogGridSize = gridSize;
      } else if (gridOffset == -1 && ogSceneX - sceneX > ogGridSize) {
        const gridSize = canvas.dimensions.size;
        gridScaler.refreshGridForResize(snapPos, gridSize)

        ogSceneX = sceneX;
        ogGridSize = gridSize;
      } else {
        gridScaler.refreshGridForResize(snapPos, 0)
      }
    }, 50)
  }

  refreshGridForResize(oldSnapPos, extraOffset) {
    const newSnapPos = canvas.grid.getSnappedPoint(new PIXI.Point(canvas.dimensions.sceneX, canvas.dimensions.sceneY), { mode: CONST.GRID_SNAPPING_MODES.CENTER });
    const gridOffsetX = newSnapPos.x - oldSnapPos.x + extraOffset;
    const gridOffsetY = newSnapPos.y - oldSnapPos.y + extraOffset;

    gridUtils.refreshGrid({ background: true, offsetX: gridOffsetX, offsetY: gridOffsetY, offsetSize: 0 })
  }

  // Renders a dialog that lets the user enter known X/Y values.
  async openGridSizeDialog() {
    const templatePath = 'modules/scaleGrid/templates/known-xy.html';
    const html = await foundry.applications.handlebars.renderTemplate(templatePath, null);
    let gridCountEl;

    foundry.applications.api.DialogV2.prompt({
      window: { title: "Set Grid Size" },
      content: html,
      ok: {
        icon: "fas fa-check",
        label: "OK",
        callback: async (event, button, dialog) => {
          const gridCount = parseFloat(gridCountEl.value);
          const gridSize = await gridUtils.getGridSizeByCount(gridCount);

          if (gridSize > 0) {
            await gridScaler.setGridSize(gridSize);
          }
        }
      },
      render: (event, dialog) => {
        gridCountEl = dialog.element.querySelector("#grid-count");
      },
      rejectClose: false
    });
  }

  resetDialog(_) {
    foundry.applications.api.DialogV2.confirm({
      window: { title: "Reset grid?" },
      content: "<p>Reset grid to defaults?</p>",
      yes: {
        icon: "fas fa-check",
        label: "Reset",
        callback: () => {
          gridScaler.resetGrid();
        }
      },
      no: {
        icon: "fas fa-times",
        label: "Cancel"
      },
      defaultYes: false,
      rejectClose: false
    });
  }

  // <================== Toggle Grid  ====================>

  // Sometimes the map you're using already has a grid printed on it, so you want the Foundry grid
  // to be fully transparent or just really light. In those cases, it's a pain to manually configure 
  // the settings to make it easier to see while you line up the Foundry grid. This lets you toggle 
  // an easy to see grid temporarily to make the job easier.
  toggleGrid(isActive) {
    const curSceneId = canvas.scene.id;

    if (isActive) {
      if (!gridScaler.cavasGridTempSettings[curSceneId]) {
        gridScaler.saveGridSettings(curSceneId);
        gridScaler.makeGridVisible();
      }
    } else {
      if (gridScaler.cavasGridTempSettings[curSceneId]) {
        gridScaler.resetGridSettings(curSceneId);
      }
    }
  }

  // Turn the grid red and make it fully opaque and visible.
  async makeGridVisible() {
    await canvas.scene.update({
      "grid.alpha": 1,
      "grid.color": "#FF0000"
    });
  }

  // Save the color and alpha of the current scene's grid.
  // We'll use this to reset it when the preview is toggled off. 
  saveGridSettings(sceneId) {
    const scene = canvas.scene;
    
    const settings = {
      alpha: scene.grid.alpha,
      color: scene.grid.color
    };

    gridScaler.cavasGridTempSettings[sceneId] = settings;
  }

  // Set the grid's color and alpha back to their original settings.
  async resetGridSettings(sceneId) {
    const settings = gridScaler.cavasGridTempSettings[sceneId];

    if (settings) {
      await canvas.scene.update({
        "grid.alpha": settings.alpha,
        "grid.color": settings.color
      });

      gridScaler.cavasGridTempSettings[sceneId] = null;
    }
  }

  // <================== Initialize  ====================>

  // Initialize the ScaleGridLayer. Attach the button to the controls, draw the square, and the draw text.
  initialize() {
    Hooks.on('getSceneControlButtons', controls => {
      if (game.user.isGM) {
        controls.grid = gridScaler.newButtons;
      }
    });

    // only draw objects when canvas is ready
    Hooks.on('canvasReady', _ => {
      gridScaler.initializePixi();
    });
  }
}

const gridScaler = new ScaleGridLayer();
gridScaler.setButtons();
gridScaler.initialize();

// Add a releaseAll function to the GridLayer class so it can pass through the Canvas.tearDown method -- to be fixed in a future Foundry release
GridLayer.prototype.releaseAll = function () { };

gridUtils.log("** Finished Loading **");