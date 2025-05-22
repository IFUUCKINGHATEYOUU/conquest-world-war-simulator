class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: "MainScene" });
    // Existing properties
    this.selectedUnit = null; // For individual selection
    this.selectedUnits = []; // Global selection: array of player's troops
    this.globalSelectionActive = false; // Already used with U key
    this.capitals = {}; // Capital containers keyed by country code (uppercase A3)

    // NEW: Grid-based Territory Properties
    this.gridSize = 5; // User-defined: Size of each grid cell in pixels (adjust as needed)
    this.gridWidth = 0; // Will be calculated based on world map size and gridSize
    this.gridHeight = 0; // Will be calculated based on world map size and gridSize
    this.territoryGrid = []; // 2D array to store country codes (A3)

    // New properties for area selection (Y-key)
    this.areaSelectionActive = false;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.selectionGraphics = null;

    // NEW: Properties for Area CAPTURE selection (E-key)
    this.areaCaptureActive = false;
    this.captureSelectionStart = null;
    this.captureSelectionEnd = null;
    // Reusing selectionGraphics for capture area visual

    // NEW: Properties for Auto-Capture Target Management
    this.autoCaptureTargets = []; // List of {x, y} grid cells being targeted for capture
    this.unitsAutoCapturing = new Set(); // Set of unit containers currently in auto-capture movement

    // Storage properties (initialized as empty, groups will be created in create())
    this.countryColors = {}; // Stores colors keyed by A3 code
    this.cityContainers = {};
    // Modified: countryCodeMap maps from *any* key found in data to A3 uppercase
    this.countryCodeMap = {}; // Key: various codes (A3 upper, A2 upper, A2 lower), Value: A3 uppercase

    // Groups will be initialized in the create() method
    this.cityGroup = null; // Will be set in create()
    this.troopGroup = null; // Will be set in create()

    // --- NEW: Group for country name text ---
    this.countryNameGroup = null; // Will be set in create()
    this.countryNameTexts = {}; // To store references to the text objects keyed by A3 code
    // --- END NEW ---

    // Keyboard input objects (initialized as null, assigned in create())
    this.cursors = null;
    this.wKey = null;
    this.aKey = null;
    this.sKey = null;
    this.dKey = null;
    this.rKey = null; // NEW: R key for auto-capture country
    this.eKey = null; // NEW: E key for auto-capture area

    // NEW: RenderTexture for the map
    this.mapRenderTexture = null;
    // NEW: Graphics object for drawing *all* map elements onto the RenderTexture (will be destroyed after initial map drawing)
    this.mapDrawer = null;
    // NEW: Graphics object for drawing player's owned land onto the RenderTexture (will be destroyed after initial drawing)
    this.ownedLandDrawer = null;
    // NEW: Reusable Graphics object for drawing individual pixels for terrain updates (will not be destroyed)
    this.pixelDrawer = null;
    // NEW: Loading screen text elements
    this.loadingText = null;
    this.loadingSubText = null;

    // NEW: Invasion mechanics properties
    this.territoryControl = []; // 2D array (0-100% control)
    this.occupyingForces = []; // 2D array of unit references
    this.controlGraphics = null; // Visual overlay for contested areas
    this.controlUpdateTimer = 0; // For periodic updates
    this.supplyRange = 5; // Grid cells for supply lines
    this.baseAttritionRate = 0.005; // Damage rate per second per second in enemy territory

    // Added: Store the player's selected country A3 code consistently
    this.playerCountryA3 = null;
    // UI elements (initialized as null, assigned in createUI())
    this.uiPanelLeft = null;
    this.uiTextCenter = null; // Explicitly initialized here
    this.uiPanelCenter = null;
    this.uiPanelRight = null;
    this.invasionStatusPanel = null;
    this.invasionStatusText = null; // Explicitly initialized here
    this.uiPanelInvasion = null;
  }

  preload() {
    // --- Set up loading screen text ---
    this.loadingText = this.add
      .text(
        this.sys.game.config.width / 2,
        this.sys.game.config.height / 2 - 50,
        "Loading...",
        { font: "48px Arial", fill: "#ffffff" }
      )
      .setOrigin(0.5)
      .setScrollFactor(0); // setScrollFactor(0) keeps it fixed on camera

    this.loadingSubText = this.add
      .text(
        this.sys.game.config.width / 2,
        this.sys.game.config.height / 2 + 20,
        "Initializing...",
        { font: "24px Arial", fill: "#ffffff" }
      )
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.load.on("progress", (value) => {
      this.loadingSubText.setText(
        `Loading Assets: ${Math.round(value * 100)}%`
      );
    });

    this.load.on("fileprogress", (file) => {
      this.loadingSubText.setText(
        `Loading: ${file.key} (${Math.round(this.load.progress * 100)}%)`
      );
    });
    // --- Load all game assets ---
    this.load.json("countries", "countries-land-10km.geo.json"); // Load country data (with polygons)
    this.load.json("capitals", "capitals.geojson.json"); // Load capitals data
    this.load.json("countryData", "countries.json"); // Load country general data (keyed by A2 lowercase)
  }

  create() {
    console.log("Scene Create started.");
    // Update sub-text for the beginning of create phase
    this.loadingSubText.setText("Setting up game scene...");
    console.log("DEBUG: Before initializing game groups.");
    // --- Initialize Groups ---
    this.cityGroup = this.add.group();
    this.troopGroup = this.add.group();
    // --- NEW: Initialize country name group ---
    this.countryNameGroup = this.add.group();
    // --- END NEW ---
    this.loadingSubText.setText("Initializing game groups...");
    console.log("DEBUG: After initializing game groups.");

    // Basic parameters and offsets.
    this.scaleFactor = 20; // Changed from 30 to 10
    this.offsetX = this.sys.game.config.width / 2;
    this.offsetY = this.sys.game.config.height / 2;
    const worldMapWidth = 360 * this.scaleFactor;
    const mercatorLatRange = 170.1;
    const worldMapHeight = mercatorLatRange * this.scaleFactor;
    // Corrected calculation for mercator height

    this.mapRenderTexture = this.add.renderTexture(
      0,
      0,
      worldMapWidth,
      worldMapHeight
    );
    this.mapRenderTexture.setOrigin(0.5, 0.5);
    this.mapRenderTexture.setPosition(this.offsetX, this.offsetY);

    this.mapDrawer = this.add.graphics();
    this.ownedLandDrawer = this.add.graphics();
    this.pixelDrawer = this.add.graphics();
    this.loadingSubText.setText("Preparing map rendering surfaces...");
    console.log("DEBUG: After preparing map rendering surfaces.");

    // Initialize the grid
    this.initializeTerritoryGrid();
    this.loadingSubText.setText(
      `Initializing territory grid (resolution: ${this.gridSize}px)...`
    );
    console.log("DEBUG: After initializing territory grid.");
    // Initialize selection graphics (reused for both Y and E keys)
    this.selectionGraphics = this.add.graphics({
      lineStyle: { width: 2, color: 0x00ff00 },
      fillStyle: { color: 0x00ff00, alpha: 0.3 },
    });
    this.loadingSubText.setText("Setting up selection graphics...");

    // --- Keyboard Input Initialization ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.sKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R); // NEW
    this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E); // NEW
    this.loadingSubText.setText("Configuring input controls...");

    this.countryData = this.cache.json.get("countryData");
    if (!this.countryData) {
      console.warn("Country data not loaded or is empty.", this.countryData);
      this.loadingText.setText("Error Loading Game");
      this.loadingSubText.setText("Country data missing.");
      return;
    }
    this.loadingSubText.setText("Loading country data...");
    // --- Process Capitals to build the Country Code Map and add Cities ---
    let capitalsData = this.cache.json.get("capitals");
    if (!capitalsData || !capitalsData.features) {
      console.warn("Capitals data not loaded or is empty.", capitalsData);
      this.loadingText.setText("Error Loading Game");
      this.loadingSubText.setText("Capital data missing.");
      return;
    }

    console.log(
      "DEBUG: Building country code map from capitals data and adding cities."
    );
    const totalCapitals = capitalsData.features.length;
    let processedCapitals = 0;
    capitalsData.features.forEach((feature) => {
      const props = feature.properties;
      let countryA3 = props.iso3 ? String(props.iso3).toUpperCase() : null; // Ensure string and uppercase
      let countryA2 = props.iso2 ? String(props.iso2).toLowerCase() : null; // Ensure string and lowercase
      let capitalName = props.city;
      let capLat = feature.geometry.coordinates[1];
      let capLon = feature.geometry.coordinates[0];

      // Prioritize A3 from capitals as the target A3 uppercase
      let targetA3Upper = countryA3;

      if (targetA3Upper) {
        // Map A3 uppercase to itself
        this.countryCodeMap[targetA3Upper] = targetA3Upper;

        // If A2 exists, map A2 uppercase and lowercase to the target A3 uppercase
        if (countryA2) {
          this.countryCodeMap[countryA2.toUpperCase()] = targetA3Upper;
          this.countryCodeMap[countryA2] = targetA3Upper; // map lowercase A2
        }
        this.addCity(capLat, capLon, capitalName, true, targetA3Upper); // Pass target A3 uppercase
      } else if (countryA2) {
        // If only A2 exists in capitals, use A2 uppercase as a fallback target A3
        let fallbackA3Upper = countryA2.toUpperCase();
        this.countryCodeMap[fallbackA3Upper] = fallbackA3Upper;
        this.countryCodeMap[countryA2] = fallbackA3Upper; // map lowercase A2 to fallback

        this.addCity(capLat, capLon, capitalName, true, fallbackA3Upper); // Pass fallback A3 uppercase

        console.warn(
          `Capital entry with A2 only found: ${countryA2}. Using A2 uppercase as fallback A3: ${fallbackA3Upper}`
        );
      } else {
        console.warn(
          "Capital feature missing both A3 and A2 codes:",
          feature.properties
        );
        return; // Skip adding city if no codes
      }

      this.startPopulationGrowth(capitalName);
      processedCapitals++;
      if (processedCapitals % 50 === 0 || processedCapitals === totalCapitals) {
        this.loadingSubText.setText(
          `Processing capitals and mapping codes: ${processedCapitals}/${totalCapitals}`
        );
      }
    });
    // After processing capitals, also add mappings from countryData keys (A2 lowercase) to their corresponding A3 if known
    // This helps link A2 codes from countryData to A3 codes derived from capitals or fallbacks.
    Object.keys(this.countryData).forEach((a2CodeLower) => {
      const a2CodeUpper = a2CodeLower.toUpperCase();
      // If the lowercase A2 is not already mapped to an A3 (from capitals data)
      if (!this.countryCodeMap[a2CodeLower]) {
        // Check if the uppercase A2 is mapped to an A3
        const mappedA3 = this.countryCodeMap[a2CodeUpper];
        if (mappedA3) {
          this.countryCodeMap[a2CodeLower] = mappedA3; // Map lowercase A2 to the same A3
        } else {
          // If neither A2 case is mapped, and it's a 2-letter code,
          // check if there's a capital with this A2 code but no A3.
          // If so, map both A2 cases to the A2 uppercase as a fallback A3.
          // This is already handled in the capitals loop, so this block might be redundant now.
        }
      }
    });

    console.log(
      "DEBUG: Finished building country code map.",
      this.countryCodeMap
    );
    console.log("DEBUG: Finished adding cities.", this.capitals); // Also log capitals for inspection
    this.loadingSubText.setText("Mapping country codes and adding cities...");
    // --- Determine Player Country A3 Code from localStorage ---
    let localStorageCountry = localStorage.getItem("selectedCountry");
    // Resolve the localStorage value to a consistent A3 uppercase code as early as possible
    // Use getA3CodeFromAny with the map now populated from capitals
    this.playerCountryA3 = this.getA3CodeFromAny(localStorageCountry) || "USA"; // Default to USA A3 if resolution fails

    console.log(
      `DEBUG: Player selected country from localStorage: "${localStorageCountry}". Resolved A3: "${
        this.playerCountryA3
      }". countryCodeMap[String(localStorageCountry).toUpperCase()]: ${
        this.countryCodeMap[String(localStorageCountry).toUpperCase()]
      }`
    );
    this.loadingSubText.setText(`Player Country: ${this.playerCountryA3}`); // Update loading text

    // --- Process Countries for Polygons and Grid ---
    let countriesData = this.cache.json.get("countries");
    if (!countriesData || !countriesData.features) {
      console.warn("Countries data not loaded or is empty.", countriesData);
      this.loadingText.setText("Error Loading Game");
      this.loadingSubText.setText("Map data missing.");
      return;
    }
    console.log("DEBUG: Before processing countries forEach loop.");
    const totalCountries = countriesData.features.length;
    let processedCountries = 0;
    countriesData.features.forEach((feature) => {
      // Corrected: Removed extra .features
      if (!feature.geometry || !feature.geometry.coordinates) return;
      // Prioritize A3 as it's common in the map data
      let countryCode =
        feature.properties.A3 ||
        feature.properties.iso_a3 ||
        feature.properties.iso_a2; // Fallback to A2

      if (!countryCode) {
        console.warn(
          "Country feature missing A3/ISO code:",
          feature.properties
        );
        return;
      }

      // Resolve the country code to A3 uppercase using the improved helper
      let countryCodeA3Upper = this.getA3CodeFromAny(countryCode);

      if (!countryCodeA3Upper) {
        console.warn(
          `Could not resolve A3 code for ${countryCode} from map data. Skipping polygon render.`
        );
        return;
      }

      if (feature.geometry.type === "Polygon") {
        this.renderAndStorePolygon(
          feature.geometry.coordinates[0],
          countryCodeA3Upper // Pass the resolved A3 uppercase code
        );
      } else if (feature.geometry.type === "MultiPolygon") {
        feature.geometry.coordinates.forEach((polyArr) => {
          this.renderAndStorePolygon(
            polyArr[0],
            countryCodeA3Upper // Pass the resolved A3 uppercase code
          );
        });
      }
      processedCountries++;
      // Update sub-text more frequently for longer processes
      if (
        processedCountries % 50 === 0 ||
        processedCountries === totalCountries
      ) {
        this.loadingSubText.setText(
          `Processing countries: ${processedCountries}/${totalCountries}`
        );
      }
    });
    console.log(
      `DEBUG: Finished processing all ${processedCountries} countries in forEach loop.`
    );

    this.mapRenderTexture.draw(this.mapDrawer, 0, 0);
    console.log("DEBUG: MapDrawer content drawn onto RenderTexture.");
    this.mapDrawer.destroy();
    console.log("DEBUG: MapDrawer destroyed.");
    this.loadingSubText.setText("Drawing world map...");

    // --- Determine Owned Land ---
    this.loadingSubText.setText("Determining owned land...");
    console.log("DEBUG: Before determining owned land.");
    // Use the stored playerCountryA3
    let selectedCountryA3 = this.playerCountryA3;

    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        // Check if the territory grid cell belongs to the selected country (using A3)
        if (
          this.territoryGrid[y] &&
          this.territoryGrid[y][x] === selectedCountryA3
        ) {
          // Use the correct A3 code to get the color
          let color = Phaser.Display.Color.HexStringToColor(
            this.countryColors[selectedCountryA3] || "#FFFFFF" // Look up color using A3 from countryColors
          ).color;
          this.ownedLandDrawer.fillStyle(color, 1);
          this.ownedLandDrawer.fillRect(
            x * this.gridSize,
            y * this.gridSize,
            this.gridSize,
            this.gridSize
          );
        }
      }
    }
    this.mapRenderTexture.draw(this.ownedLandDrawer, 0, 0);
    this.ownedLandDrawer.destroy();
    this.loadingSubText.setText("Marking owned territories...");
    console.log("DEBUG: After marking owned territories.");
    // --- NEW: Place initial country name labels ---
    this.loadingSubText.setText("Placing country name labels...");
    // Iterate through countries that have land (based on colors assigned)
    Object.keys(this.countryColors).forEach((countryA3) => {
      // Find the first grid cell for this country
      let foundCell = null;
      for (let y = 0; y < this.gridHeight; y++) {
        for (let x = 0; x < this.gridWidth; x++) {
          if (this.territoryGrid[y] && this.territoryGrid[y][x] === countryA3) {
            foundCell = { x, y };
            break; // Found a cell, no need to check further for this country
          }
        }
        if (foundCell) break; // Found a cell, break outer loop
      }

      if (foundCell) {
        // Convert grid coordinates to world coordinates (center of the grid cell)
        const worldX =
          foundCell.x * this.gridSize +
          (this.offsetX - 180 * this.scaleFactor) +
          this.gridSize / 2;
        const worldY =
          foundCell.y * this.gridSize +
          (this.offsetY - 85 * this.scaleFactor) +
          this.gridSize / 2;

        // Find the country name from countryData using the A3 code
        let countryName = countryA3; // Default to A3 code
        let countryA2Lower = this.getA2CodeFromA3(countryA3);
        if (
          countryA2Lower &&
          this.countryData[countryA2Lower] &&
          this.countryData[countryA2Lower].name
        ) {
          countryName = this.countryData[countryA2Lower].name;
        }

        const nameText = this.add
          .text(worldX, worldY, countryName, {
            font: "Bold 20px Arial", // Adjust font size and style as needed
            fill: "#ffffff", // White text color
            stroke: "#000000", // Black stroke for readability
            strokeThickness: 2,
            wordWrap: { width: this.gridSize * 10, useAdvancedWrap: true }, // Increased word wrap width
            align: "center", // Center align multi-line text
          })
          .setOrigin(0.5)
          .setDepth(2); // Set origin to center, higher depth

        this.countryNameGroup.add(nameText); // Add to the group
        this.countryNameTexts[countryA3] = nameText; // Store reference
        // No need for 'placedCountries' set with this iteration method
      }
    });
    console.log(
      `DEBUG: Placed names for ${
        Object.keys(this.countryNameTexts).length
      } countries.`
    );
    // --- END NEW ---

    // Initialize invasion systems
    this.initializeInvasionSystems();

    // Add control graphics layer after map is drawn
    // Ensure this is done after the map is drawn so it's on top.
    this.controlGraphics = this.add.graphics();

    // --- Adjust Camera to view the entire map ---
    const gameWidth = this.sys.game.config.width;
    const gameHeight = this.sys.game.config.height;
    const zoomX = gameWidth / worldMapWidth;
    const zoomY = gameHeight / worldMapHeight;
    const initialZoom = Math.min(zoomX, zoomY) * 0.9;
    let cam = this.cameras.main;
    cam.setZoom(initialZoom);
    cam.centerOn(this.offsetX, this.offsetY);
    this.loadingSubText.setText("Adjusting camera view...");
    console.log("DEBUG: After adjusting camera.");
    // --- Button Event Handlers ---
    document
      .getElementById("createTroopButton")
      .addEventListener("click", () => {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        if (!this.capitals[selectedCountryA3]) {
          alert(
            "No capital found for the selected country: " + selectedCountryA3
          );
          return;
        }
        let capitalContainer = this.capitals[selectedCountryA3];
        let lat = (this.offsetY - capitalContainer.y) / this.scaleFactor;
        let lon = (capitalContainer.x - this.offsetX) / this.scaleFactor;
        this.addUnit(lat, lon, 10000, selectedCountryA3); // Pass A3 uppercase
      });
    document.getElementById("buildCityButton").addEventListener("click", () => {
      alert("Click anywhere on the map to place a new city!");
      this.input.once("pointerdown", (pointer) => {
        let worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        // isPointOnOwnedLand uses the stored playerCountryA3, which is correct
        if (!this.isPointOnOwnedLand(worldPoint)) {
          alert("You can only build cities on land you own!");
          return;
        }
        let lon = (worldPoint.x - this.offsetX) / this.scaleFactor;
        let lat = (this.offsetY - worldPoint.y) / this.scaleFactor;
        let cityName = prompt("Enter city name:");
        let isCapital = confirm("Is this a capital city?");
        if (!cityName) {
          alert("Error: Invalid city name.");
          return;
        }
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        this.addCity(lat, lon, cityName, isCapital, selectedCountryA3); // Pass A3 uppercase
        if (isCapital) this.startPopulationGrowth(cityName);
      });
    });
    // --- Keyboard Controls for Combining and Splitting ---
    this.input.keyboard.on("keydown-I", () => {
      this.combineUnits();
    });
    this.input.keyboard.on("keydown-O", () => {
      this.splitUnit();
    });
    // --- Global Selection Toggle with "U" Key (existing) ---
    this.input.keyboard.on("keydown-U", () => {
      this.toggleGlobalSelection();
    });
    // --- Area Selection Mode with "Y" Key ---
    this.input.keyboard.on("keydown-Y", () => {
      this.toggleAreaSelection();
    });
    // --- Auto-Capture Country with "R" Key ---
    this.input.keyboard.on("keydown-R", () => {
      this.handleAutoCaptureCountry(); // NEW
    });
    // --- Auto-Capture Area with "E" Key ---
    this.input.keyboard.on("keydown-E", () => {
      this.toggleAreaCaptureSelection(); // NEW
    });
    this.input.on("pointerdown", (pointer) => {
      // Check if any area selection mode is active
      if (this.areaSelectionActive) {
        this.onPointerDownForAreaSelection(pointer);
        return; // Stop further processing if area selection is active
      } else if (this.areaCaptureActive) {
        // NEW: Check for area capture mode
        this.onPointerDownForAreaCapture(pointer); // NEW handler for capture
        return; // Stop further processing if area capture is active
      }

      let worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

      // Handle global selection movement
      if (this.globalSelectionActive && this.selectedUnits.length > 0) {
        this.selectedUnits.forEach((unit) => {
          // Only move units from the player's country
          if (unit.country !== this.playerCountryA3) return;

          // If the unit was auto-capturing, stop that behavior before manual move
          if (this.unitsAutoCapturing.has(unit)) {
            this.unitsAutoCapturing.delete(unit);
            // Potentially stop any active tweens on the unit related to auto-capture
            if (unit.tween) {
              unit.tween.stop();
              delete unit.tween;
            }
            delete unit.targetCell; // Clear the assigned target cell
          }

          let distance = Phaser.Math.Distance.Between(
            unit.x,
            unit.y,
            worldPoint.x,
            worldPoint.y
          );
          let fixedSpeed = 50; // pixels per second
          let duration = (distance / fixedSpeed) * 1000;
          this.tweens.add({
            targets: unit,
            x: worldPoint.x,
            y: worldPoint.y,
            duration: duration,
            ease: "Linear",
            onComplete: () => {
              this.updateTerrainColor(
                { x: unit.x, y: unit.y }, // Use pos directly, it's already world coordinates
                this.countryColors[unit.country] || "#FFFFFF", // unit.country is A3 uppercase
                unit.country // Pass A3 uppercase
              );
            },
          });
        });
      }
      // Handle individual unit movement (NEW LOGIC)
      else if (this.selectedUnit) {
        let unit = this.selectedUnit;
        let spriteInside = unit.list[0];
        // Only move units from the player's country
        if (unit.country !== this.playerCountryA3) return;
        // If the unit was auto-capturing, stop that behavior before manual move
        if (this.unitsAutoCapturing.has(unit)) {
          this.unitsAutoCapturing.delete(unit);
          // Potentially stop any active tweens on the unit related to auto-capture
          if (unit.tween) {
            unit.tween.stop();
            delete unit.tween;
          }
          delete unit.targetCell; // Clear the assigned target cell
        }

        let distance = Phaser.Math.Distance.Between(
          unit.x,
          unit.y,
          worldPoint.x,
          worldPoint.y
        );
        let fixedSpeed = 50; // pixels per second
        let duration = (distance / fixedSpeed) * 1000;
        this.tweens.add({
          targets: unit,
          x: worldPoint.x,
          y: worldPoint.y,
          duration: duration,
          ease: "Linear",
          onComplete: () => {
            this.selectedUnit = null; // Deselect unit after movement
            if (spriteInside instanceof Phaser.GameObjects.Sprite) {
              spriteInside.clearTint();
            }
            this.updateTerrainColor(
              { x: unit.x, y: unit.y }, // Use pos directly
              this.countryColors[unit.country] || "#FFFFFF", // unit.country is A3 uppercase
              unit.country // Pass A3 uppercase
            );
          },
        });
      }
    });
    // Moved pointermove handler for area selection outside the main pointerdown handler
    this.input.on("pointermove", (pointer) => {
      if (this.areaSelectionActive) {
        this.onPointerMoveForAreaSelection(pointer);
      } else if (this.areaCaptureActive) {
        // NEW: Check for area capture mode
        this.onPointerMoveForAreaCapture(pointer); // NEW handler for capture
      }
    });
    // --- Other Keyboard Controls (Zoom and Split All Troops) ---
    this.input.keyboard.on("keydown-Z", () => {
      this.cameras.main.setZoom(
        Phaser.Math.Clamp(this.cameras.main.zoom + 0.1, 0.01, 5)
      );
    });
    this.input.keyboard.on("keydown-X", () => {
      this.cameras.main.setZoom(
        Phaser.Math.Clamp(this.cameras.main.zoom - 0.1, 0.01, 5)
      );
    });
    this.input.keyboard.on("keydown-T", () => {
      this.splitAllTroops();
    });
    // --- Hide loading text when everything is done. ---
    this.loadingText.destroy();
    this.loadingSubText.destroy();
    console.log("DEBUG: Loading text destroyed.");
    console.log("Scene Create finished. Game Ready.");
    // --- Call createUI to initialize UI elements ---
    this.createUI();
    console.log("DEBUG: createUI called.");
  }

  // ===== NEW METHODS FOR INVASION SYSTEMS =====
  initializeInvasionSystems() {
    console.log("DEBUG INVASION: initializeInvasionSystems started.");
    // Initialize control and occupation grids
    this.territoryControl = new Array(this.gridHeight)
      .fill(null)
      .map(() => new Array(this.gridWidth).fill(0));

    this.occupyingForces = new Array(this.gridHeight)
      .fill(null)
      .map(() => new Array(this.gridWidth).fill([]));
    // Set initial control values for owned land using the stored playerCountryA3
    let selectedCountryA3 = this.playerCountryA3;
    console.log(
      `DEBUG INVASION: Setting initial control for player country: ${selectedCountryA3}`
    );
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (
          this.territoryGrid[y] &&
          this.territoryGrid[y][x] === selectedCountryA3
        ) {
          // Compare with A3, add bounds check
          this.territoryControl[y][x] = 100;
        }
      }
    }
    console.log(
      "DEBUG INVASION: initializeInvasionSystems finished. Initial territoryControl state:",
      this.territoryControl
    );
  }

  update(time, delta) {
    let cam = this.cameras.main;
    let cameraSpeed = 500; // pixels per second

    if (this.cursors) {
      if (this.cursors.left.isDown || this.aKey.isDown) {
        cam.scrollX -= (cameraSpeed * delta) / 1000;
      }
      if (this.cursors.right.isDown || this.dKey.isDown) {
        cam.scrollX += (cameraSpeed * delta) / 1000;
      }
      if (this.cursors.up.isDown || this.wKey.isDown) {
        cam.scrollY -= (cameraSpeed * delta) / 1000;
      }
      if (this.cursors.down.isDown || this.sKey.isDown) {
        cam.scrollY += (cameraSpeed * delta) / 1000;
      }
    }

    // Update invasion systems (every 500ms for performance)
    this.controlUpdateTimer += delta;
    if (this.controlUpdateTimer >= 100) {
      // console.log(`DEBUG INVASION: update called. Delta: ${delta}. Timer: ${this.controlUpdateTimer}`); // Too verbose
      this.updateTerritoryControl(delta);
      this.updateOccupationTracking();
      this.controlUpdateTimer = 0;
    }

    // Visual refinement: troops color land as they move (call updateTerrainColor for each moving unit)
    this.unitsAutoCapturing.forEach((unit) => {
      // Check if unit is currently tweening or has moved
      if (unit.tween || unit.lastPosition) {
        const hasMoved =
          !unit.lastPosition ||
          unit.x !== unit.lastPosition.x ||
          unit.y !== unit.lastPosition.y;
        if (hasMoved) {
          this.updateTerrainColor(
            { x: unit.x, y: unit.y },
            this.countryColors[unit.country] || "#FFFFFF", // unit.country is A3 uppercase
            unit.country // Pass A3 uppercase
          );
          unit.lastPosition = { x: unit.x, y: unit.y };
        }
      }
    });
    this.troopGroup.getChildren().forEach((unit) => {
      // This is a basic check, can be refined to only track units currently ordered to move
      if (unit.tween) {
        const hasMoved =
          !unit.lastPosition ||
          unit.x !== unit.lastPosition.x ||
          unit.y !== unit.lastPosition.y;
        if (hasMoved) {
          this.updateTerrainColor(
            { x: unit.x, y: unit.y },
            this.countryColors[unit.country] || "#FFFFFF", // unit.country is A3 uppercase
            unit.country // Pass A3 uppercase
          );
          unit.lastPosition = { x: unit.x, y: unit.y };
        }
      }
    });
    // --- NEW: Update country name text color based on ownership ---
    // This is a simple update; more complex logic for placement/visibility will be needed later.
    Object.keys(this.countryNameTexts).forEach((countryA3) => {
      const nameText = this.countryNameTexts[countryA3];
      if (nameText) {
        // Find the grid cell where the text is placed
        const textGridX = Math.floor(
          (nameText.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
        );
        const textGridY = Math.floor(
          (nameText.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
        );

        // Check if the grid cell is within bounds
        if (
          textGridY >= 0 &&
          textGridY < this.gridHeight &&
          textGridX >= 0 &&
          textGridX < this.gridWidth
        ) {
          const currentOwnerA3 = this.territoryGrid[textGridY]
            ? this.territoryGrid[textGridY][textGridX]
            : null; // Add bounds check

          if (currentOwnerA3 && this.countryColors[currentOwnerA3]) {
            const ownerColorHex = this.countryColors[currentOwnerA3];

            try {
              // Attempt to convert hex string to integer color value
              const ownerColorInt = parseInt(
                ownerColorHex.replace(/^#/, ""),
                16
              );

              // Check if parsing was successful and the color is valid
              if (!isNaN(ownerColorInt)) {
                // Convert integer color to HSV
                const hsvColor =
                  Phaser.Display.Color.IntegerToHSV(ownerColorInt);
                if (hsvColor) {
                  // Manually apply darkening (reduce V)
                  // Darken by 50% of the current value: V = V * (1 - darkenAmount / 100)
                  hsvColor.v = hsvColor.v * (1 - 50 / 100);
                  // Manually apply saturating (increase S)
                  // Saturate by 50% of the remaining range: S = S + (1 - S) * (saturateAmount / 100)
                  hsvColor.s = hsvColor.s + (1 - hsvColor.s) * (50 / 100);
                  // Clamp S to 1
                  hsvColor.s = Math.min(1, hsvColor.s);

                  // Convert modified HSV back to RGB
                  const rgbColor = Phaser.Display.Color.HSVToRGB(
                    hsvColor.h,
                    hsvColor.s,
                    hsvColor.v
                  );
                  if (rgbColor) {
                    // Manually convert RGB to Hex String
                    // Ensure RGB values are clamped to 0-255
                    const r = Math.max(
                      0,
                      Math.min(255, Math.round(rgbColor.r))
                    );
                    const g = Math.max(
                      0,
                      Math.min(255, Math.round(rgbColor.g))
                    );
                    const b = Math.max(
                      0,
                      Math.min(255, Math.round(rgbColor.b))
                    );
                    const finalColorHex =
                      "#" +
                      r.toString(16).padStart(2, "0") +
                      g.toString(16).padStart(2, "0") +
                      b.toString(16).padStart(2, "0");
                    nameText.setColor(finalColorHex);
                  } else {
                    console.warn(
                      "Failed to convert HSV back to RGB for text color:",
                      hsvColor
                    );
                    nameText.setColor("#808080"); // Default to grey
                  }
                } else {
                  console.warn(
                    "Failed to convert integer color to HSV for text color:",
                    ownerColorInt,
                    ownerColorHex
                  );
                  nameText.setColor("#808080"); // Default to grey
                }
              } else {
                console.warn(
                  "Failed to parse hex string to integer color for text color:",
                  ownerColorHex
                );
                nameText.setColor("#808080"); // Default to grey
              }
            } catch (e) {
              console.error(
                `Error processing color for text ${countryA3} with hex ${ownerColorHex}:`,
                e
              );
              nameText.setColor("#808080"); // Default to grey on error
            }
          } else {
            // If the tile is unowned or country color not found, maybe default to grey
            nameText.setColor("#808080");
          }
        }
      }
    });
    // --- END NEW ---
    this.updateUI(); // Call updateUI here to refresh UI
  }
  updateOccupationTracking() {
    // console.log("DEBUG INVASION: updateOccupationTracking started."); // Too verbose
    // Clear old occupation data
    this.occupyingForces.forEach((row) => row.fill([]));
    // Track which units are in which grid cells
    this.troopGroup.getChildren().forEach((unit) => {
      const gridX = Math.floor(
        (unit.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
      );
      const gridY = Math.floor(
        (unit.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
      );
      if (
        gridY >= 0 &&
        gridY < this.gridHeight &&
        gridX >= 0 &&
        gridX < this.gridWidth
      ) {
        this.occupyingForces[gridY][gridX] =
          this.occupyingForces[gridY][gridX].concat(unit);
        // console.log(`DEBUG INVASION: Unit (${unit.country}, ${unit.troopCount} troops) at world [${unit.x},${unit.y}] is in grid [${gridX},${gridY}].`); // Too verbose
      } else {
        // console.warn(`DEBUG INVASION: Unit at world [${unit.x},${unit.y}] is outside grid bounds. Grid size: ${this.gridWidth}x${this.gridHeight}.`); // Too verbose unless debugging troop placement
      }
    });
    // console.log("DEBUG INVASION: updateOccupationTracking finished. OccupyingForces sample:", this.occupyingForces.slice(0, 5).map(row => row.slice(0, 5))); // Too verbose
  }
  updateTerritoryControl(delta) {
    // console.log("DEBUG INVASION: updateTerritoryControl started. Delta (ms):", delta); // Too verbose
    const newControl = new Array(this.gridHeight)
      .fill(null)
      .map(() => new Array(this.gridWidth).fill(0));
    // Calculate influence from all troops
    this.troopGroup.getChildren().forEach((unit) => {
      const gridX = Math.floor(
        (unit.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
      );
      const gridY = Math.floor(
        (unit.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
      );
      if (
        gridY >= 0 &&
        gridY < this.gridHeight &&
        gridX >= 0 &&
        gridX < this.gridWidth
      ) {
        // Check supply lines
        const supplyEffectiveness = this.checkSupplyLines(unit, gridX, gridY);
        // console.log(`DEBUG INVASION: Unit at [${gridX},${gridY}] supply effectiveness: ${supplyEffectiveness.toFixed(2)}`); // Too verbose
        // Apply attrition in enemy territory
        if (
          this.territoryGrid[gridY] &&
          this.territoryGrid[gridY][gridX] &&
          this.territoryGrid[gridY][gridX] !== unit.country
        ) {
          // unit.country is A3 uppercase, Add bounds/null checks
          const attritionRate =
            this.baseAttritionRate * (1 - supplyEffectiveness * 0.5);
          const attritionAmount =
            unit.troopCount * attritionRate * (delta / 1000); // Attrition per second
          const newTroopCount = Math.max(1, unit.troopCount - attritionAmount);
          console.log(
            `DEBUG INVASION: Attrition on unit at [${gridX},${gridY}] (${
              unit.country
            }): Rate=${attritionRate.toFixed(
              4
            )}, Amount=${attrritionAmount.toFixed(2)}. New count: ${Math.round(
              newTroopCount
            )}`
          ); // Corrected log message with correct variable name
          unit.troopCount = newTroopCount;
          unit.list[1].setText(`${Math.round(unit.troopCount)} troops`);
        }
        // Exert influence (3x3 area)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = gridY + dy;
            const nx = gridX + dx;
            if (
              ny >= 0 &&
              ny < this.gridHeight &&
              nx >= 0 &&
              nx < this.gridWidth
            ) {
              // Corrected: Complete the ternary operator for distanceFactor
              const distanceFactor =
                dx === 0 && dy === 0
                  ? 1 // Center cell [cite: 151, 152]
                  : Math.abs(dx) + Math.abs(dy) === 1
                  ? 0.5
                  : 0.25; // Adjacent or diagonal [cite: 151, 152]

              const influence =
                unit.troopCount * 0.01 * supplyEffectiveness * distanceFactor;
              const currentControl = this.territoryControl[ny][nx];
              const currentOwner = this.territoryGrid[ny][nx]; // Get current owner of the cell

              // Apply influence based on unit's country
              if (currentOwner === unit.country) {
                // If unit is on its own territory, increase control towards 100
                newControl[ny][nx] += influence;
              } else {
                // If unit is on enemy/neutral territory, increase control towards unit's country
                // This is a simplified model, might need to consider existing control's country
                newControl[ny][nx] += influence; // Simply add influence, it will be capped later
              }
            }
          }
        }
      }
    });

    // Decay and Cap control values
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const currentOwner = this.territoryGrid[y][x];
        const playerCountryA3 = this.playerCountryA3; // Current player's country

        // Determine effective influence for this cell
        let effectiveInfluence = newControl[y][x];

        // Check for occupying forces and apply their country's influence
        this.occupyingForces[y][x].forEach((unit) => {
          const unitCountry = unit.country;
          // Add unit's direct presence influence
          effectiveInfluence += unit.troopCount * 0.005; // Base presence influence
        });

        let newControlValue = this.territoryControl[y][x];

        if (effectiveInfluence > 0) {
          // Control increases
          newControlValue = Math.min(
            100,
            newControlValue + effectiveInfluence * (delta / 1000)
          );
        } else {
          // Control decays if no influence or negative influence (e.g., from enemy forces)
          // For now, simple decay if no positive influence
          newControlValue = Math.max(
            0,
            newControlValue - this.baseAttritionRate * 10 * (delta / 1000)
          ); // Decay faster than attrition
        }

        this.territoryControl[y][x] = newControlValue;

        // Update territory owner if control flips
        if (newControlValue >= 90 && currentOwner !== playerCountryA3) {
          // If player gains high control
          this.territoryGrid[y][x] = playerCountryA3;
          this.updatePixelColor(
            x,
            y,
            this.countryColors[playerCountryA3] || "#FFFFFF"
          );
          // console.log(`DEBUG INVASION: Territory [${x},${y}] flipped to ${playerCountryA3}`); // Too verbose
        } else if (newControlValue <= 10 && currentOwner === playerCountryA3) {
          // If player loses control
          // This scenario needs more complex logic for who takes over.
          // For now, just set to null/neutral or a default enemy.
          // For simplicity, let's revert to the original owner if available, otherwise neutral.
          // This is a placeholder and should be refined in a full game.
          this.territoryGrid[y][x] = null; // Set to neutral
          this.updatePixelColor(x, y, "#808080"); // Grey for neutral
          // console.log(`DEBUG INVASION: Territory [${x},${y}] became neutral`); // Too verbose
        }
      }
    }
    this.drawControlOverlay(); // Redraw visual overlay
    // console.log("DEBUG INVASION: updateTerritoryControl finished."); // Too verbose
  }

  drawControlOverlay() {
    this.controlGraphics.clear();
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const control = this.territoryControl[y][x];
        const ownerA3 = this.territoryGrid[y][x];

        if (control > 0 && control < 100) {
          // Only draw for contested or partially controlled areas
          let color = 0x808080; // Default grey for contested

          if (ownerA3 === this.playerCountryA3) {
            // Player's territory being contested
            color = Phaser.Display.Color.HexStringToColor(
              this.countryColors[ownerA3] || "#FFFFFF"
            ).color;
            // Darken color to show it's contested
            let phaserColor = new Phaser.Display.Color(
              (color >> 16) & 0xff,
              (color >> 8) & 0xff,
              color & 0xff
            );
            phaserColor.darken(control / 2); // Darken more as control drops
            color = phaserColor.color;
          } else if (ownerA3) {
            // Enemy territory being contested
            color = Phaser.Display.Color.HexStringToColor(
              this.countryColors[ownerA3] || "#FFFFFF"
            ).color;
            let phaserColor = new Phaser.Display.Color(
              (color >> 16) & 0xff,
              (color >> 8) & 0xff,
              color & 0xff
            );
            phaserColor.lighten(control / 2); // Lighten more as control is gained by player
            color = phaserColor.color;
          }

          const alpha = (Math.abs(control - 50) / 50) * 0.6 + 0.1; // More opaque near 50%, less near 0 or 100%
          this.controlGraphics.fillStyle(color, alpha);
          this.controlGraphics.fillRect(
            x * this.gridSize + (this.offsetX - 180 * this.scaleFactor),
            y * this.gridSize + (this.offsetY - 85 * this.scaleFactor),
            this.gridSize,
            this.gridSize
          );
        }
      }
    }
  }

  checkSupplyLines(unit, gridX, gridY) {
    // Simple supply line check: Is the unit within supplyRange of any friendly city?
    // Use the stored playerCountryA3 for friendly cities
    let friendlyCities = Object.values(this.capitals).filter(
      (city) => city.country === this.playerCountryA3
    );
    if (friendlyCities.length === 0) {
      // No friendly cities, no supply
      return 0;
    }

    for (const city of friendlyCities) {
      // Convert city world coordinates to grid coordinates
      const cityGridX = Math.floor(
        (city.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
      );
      const cityGridY = Math.floor(
        (city.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
      );

      const distance = Math.sqrt(
        Math.pow(gridX - cityGridX, 2) + Math.pow(gridY - cityGridY, 2)
      );

      if (distance <= this.supplyRange) {
        // Closer to 1 the better, 0 if out of range.
        // Linear decay: 1 at 0 distance, 0 at supplyRange
        return 1 - distance / this.supplyRange;
      }
    }
    return 0; // No supply if no friendly city is within range
  }

  handleAutoCaptureCountry() {
    console.log("Auto-capture country mode activated.");
    // Prompt user to select a country
    const targetCountryA3 = prompt(
      "Enter the A3 code of the country to auto-capture:"
    );

    if (!targetCountryA3) {
      alert("Auto-capture cancelled.");
      return;
    }

    // Validate A3 code (basic check)
    if (!this.countryColors[targetCountryA3.toUpperCase()]) {
      alert(
        `Country with A3 code ${targetCountryA3} not found or no map data available.`
      );
      return;
    }

    // Clear existing auto-capture targets
    this.autoCaptureTargets = [];

    // Identify all grid cells belonging to the target country
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (
          this.territoryGrid[y] &&
          this.territoryGrid[y][x] === targetCountryA3.toUpperCase()
        ) {
          this.autoCaptureTargets.push({ x, y });
        }
      }
    }

    if (this.autoCaptureTargets.length === 0) {
      alert(`No territories found for ${targetCountryA3}.`);
      return;
    }

    alert(
      `Auto-capturing ${targetCountryA3} with ${this.autoCaptureTargets.length} targets. Units will now move towards these targets.`
    );
    this.assignUnitsToAutoCaptureTargets();
  }

  toggleAreaCaptureSelection() {
    this.areaCaptureActive = !this.areaCaptureActive;
    if (this.areaCaptureActive) {
      alert(
        "Area CAPTURE selection active. Click and drag to select an area to capture."
      );
      this.selectionStart = null;
      this.captureSelectionStart = null; // Ensure capture selection starts fresh
      this.captureSelectionEnd = null;
      this.selectionGraphics.clear(); // Clear any previous selection visual
      this.input.on("pointerup", this.onPointerUpForAreaCapture, this); // Attach pointerup handler
    } else {
      alert("Area CAPTURE selection deactivated.");
      this.selectionGraphics.clear();
      this.input.off("pointerup", this.onPointerUpForAreaCapture, this); // Detach pointerup handler
      this.captureSelectionStart = null;
      this.captureSelectionEnd = null;
      this.autoCaptureTargets = []; // Clear targets after deactivation
      this.stopAllAutoCapturingUnits();
    }
  }

  onPointerDownForAreaCapture(pointer) {
    let worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.captureSelectionStart = { x: worldPoint.x, y: worldPoint.y };
    this.captureSelectionEnd = { x: worldPoint.x, y: worldPoint.y }; // Initialize end to start
    this.selectionGraphics.clear();
    this.selectionGraphics.lineStyle(2, 0xff0000); // Red outline for capture
    this.selectionGraphics.fillStyle(0xff0000, 0.2); // Red fill for capture
  }

  onPointerMoveForAreaCapture(pointer) {
    if (this.captureSelectionStart) {
      let worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.captureSelectionEnd = { x: worldPoint.x, y: worldPoint.y };
      this.drawSelectionRectangle(
        this.captureSelectionStart,
        this.captureSelectionEnd
      );
    }
  }

  onPointerUpForAreaCapture(pointer) {
    if (this.captureSelectionStart && this.captureSelectionEnd) {
      this.autoCaptureTargets = this.getGridCellsInArea(
        this.captureSelectionStart,
        this.captureSelectionEnd
      );
      alert(
        `Selected ${this.autoCaptureTargets.length} cells for capture. Units will now move.`
      );
      this.assignUnitsToAutoCaptureTargets();
    }
    this.captureSelectionStart = null;
    this.captureSelectionEnd = null;
    this.selectionGraphics.clear();
    this.toggleAreaCaptureSelection(); // Deactivate selection mode after area is chosen
  }

  assignUnitsToAutoCaptureTargets() {
    this.unitsAutoCapturing.clear(); // Clear previous auto-capturing units
    if (this.autoCaptureTargets.length === 0) {
      console.log("No auto-capture targets to assign units to.");
      return;
    }

    const playerTroops = this.troopGroup
      .getChildren()
      .filter((unit) => unit.country === this.playerCountryA3);

    if (playerTroops.length === 0) {
      alert("You have no troops to assign for auto-capture!");
      return;
    }

    let targetIndex = 0;
    playerTroops.forEach((unit) => {
      if (targetIndex < this.autoCaptureTargets.length) {
        const targetCell = this.autoCaptureTargets[targetIndex];
        this.moveUnitToGridCell(unit, targetCell.x, targetCell.y);
        this.unitsAutoCapturing.add(unit);
        unit.targetCell = targetCell; // Store the assigned target
        targetIndex++;
      } else {
        // If more units than targets, loop back or stop assigning
        targetIndex = 0; // Loop back for now
        const targetCell = this.autoCaptureTargets[targetIndex];
        this.moveUnitToGridCell(unit, targetCell.x, targetCell.y);
        this.unitsAutoCapturing.add(unit);
        unit.targetCell = targetCell;
        targetIndex++;
      }
    });
    console.log(
      `Assigned ${this.unitsAutoCapturing.size} units to auto-capture targets.`
    );
  }

  stopAllAutoCapturingUnits() {
    this.unitsAutoCapturing.forEach((unit) => {
      if (unit.tween) {
        unit.tween.stop();
        delete unit.tween;
      }
      delete unit.targetCell;
    });
    this.unitsAutoCapturing.clear();
  }

  moveUnitToGridCell(unit, targetGridX, targetGridY) {
    // Convert grid coordinates to world coordinates (center of the grid cell)
    const worldX =
      targetGridX * this.gridSize +
      (this.offsetX - 180 * this.scaleFactor) +
      this.gridSize / 2;
    const worldY =
      targetGridY * this.gridSize +
      (this.offsetY - 85 * this.scaleFactor) +
      this.gridSize / 2;

    let distance = Phaser.Math.Distance.Between(unit.x, unit.y, worldX, worldY);
    let fixedSpeed = 50; // pixels per second
    let duration = (distance / fixedSpeed) * 1000;

    if (unit.tween) {
      unit.tween.stop(); // Stop any existing tween
    }

    unit.tween = this.tweens.add({
      targets: unit,
      x: worldX,
      y: worldY,
      duration: duration,
      ease: "Linear",
      onComplete: () => {
        // After reaching target, assign new target if available or stop auto-capturing
        if (this.unitsAutoCapturing.has(unit)) {
          // Find the next target for this unit
          const currentIndex = this.autoCaptureTargets.findIndex(
            (target) =>
              target.x === unit.targetCell.x && target.y === unit.targetCell.y
          );
          const nextIndex = (currentIndex + 1) % this.autoCaptureTargets.length;
          const nextTarget = this.autoCaptureTargets[nextIndex];

          if (nextTarget) {
            this.moveUnitToGridCell(unit, nextTarget.x, nextTarget.y);
            unit.targetCell = nextTarget;
          } else {
            this.unitsAutoCapturing.delete(unit); // No more targets, stop auto-capturing
            delete unit.targetCell;
          }
        }
        delete unit.tween; // Clean up tween reference
        this.updateTerrainColor(
          { x: unit.x, y: unit.y },
          this.countryColors[unit.country] || "#FFFFFF",
          unit.country
        );
      },
    });
  }

  // Helper to get A3 code from various formats (A3, A2 uppercase/lowercase)
  getA3CodeFromAny(code) {
    if (!code) return null;
    let upperCode = String(code).toUpperCase();
    // Check if already an A3 or mapped in countryCodeMap
    if (this.countryCodeMap[upperCode]) {
      return this.countryCodeMap[upperCode];
    }
    // Try mapping A2 lowercase if it was provided as uppercase
    if (code.length === 2) {
      const lowerCode = String(code).toLowerCase();
      if (this.countryCodeMap[lowerCode]) {
        return this.countryCodeMap[lowerCode];
      }
    }
    return null;
  }

  // Helper to get A2 code from A3
  getA2CodeFromA3(a3Code) {
    const countryData = this.cache.json.get("countryData");
    for (const a2 in countryData) {
      // Find A2 code that maps to the given A3
      if (this.getA3CodeFromAny(a2) === a3Code) {
        return a2;
      }
    }
    return null;
  }

  // --- UTILITY FUNCTIONS (add these if they don't exist) ---
  // Placeholder for initializeTerritoryGrid - you need to implement this
  initializeTerritoryGrid() {
    console.log("Initializing territory grid...");
    // Define map boundaries based on typical Mercator projection for world map
    // Longitude ranges from -180 to 180, Latitude from -85 to 85 (approx for Mercator)
    // Adjust these if your map data covers a different range
    const minLon = -180;
    const maxLon = 180;
    const minLat = -85; // Approximately
    const maxLat = 85; // Approximately

    // Calculate world map dimensions in terms of longitude/latitude degrees
    const lonRange = maxLon - minLon;
    const latRange = maxLat - minLat; // This is a linear range, but Mercator is not linear in Y

    // Calculate grid dimensions based on world map size and gridSize
    // The scaleFactor is important here to convert degrees to pixels
    // The worldMapWidth and worldMapHeight from create() are the pixel dimensions
    const worldMapWidth = 360 * this.scaleFactor;
    const mercatorLatRange = 170.1; // This is an approximation for height in Mercator
    const worldMapHeight = mercatorLatRange * this.scaleFactor;

    this.gridWidth = Math.ceil(worldMapWidth / this.gridSize);
    this.gridHeight = Math.ceil(worldMapHeight / this.gridSize);

    // Initialize the 2D array with nulls or a default 'ocean' value
    this.territoryGrid = new Array(this.gridHeight)
      .fill(null)
      .map(() => new Array(this.gridWidth).fill(null)); // Use null for unowned/ocean

    console.log(
      `Territory Grid initialized: ${this.gridWidth}x${this.gridHeight} cells.`
    );
  }

  // Placeholder for renderAndStorePolygon - you need to implement this
  renderAndStorePolygon(polygonCoordinates, countryA3) {
    // console.log(`Rendering polygon for ${countryA3}...`); // Too verbose
    if (!this.countryColors[countryA3]) {
      // Assign a random color if not already assigned
      this.countryColors[countryA3] =
        "#" +
        Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0");
    }

    const color = Phaser.Display.Color.HexStringToColor(
      this.countryColors[countryA3]
    ).color;
    this.mapDrawer.fillStyle(color, 1);
    this.mapDrawer.lineStyle(1, 0x000000, 0.5); // Thin black border for countries

    // Move to the first point of the polygon
    const firstPoint = this.lonLatToWorld(
      polygonCoordinates[0][0],
      polygonCoordinates[0][1]
    );
    this.mapDrawer.beginPath();
    this.mapDrawer.moveTo(firstPoint.x, firstPoint.y);

    // Draw the rest of the polygon
    for (let i = 1; i < polygonCoordinates.length; i++) {
      const worldPoint = this.lonLatToWorld(
        polygonCoordinates[i][0],
        polygonCoordinates[i][1]
      );
      this.mapDrawer.lineTo(worldPoint.x, worldPoint.y);
    }
    this.mapDrawer.closePath();
    this.mapDrawer.fillPath();
    this.mapDrawer.strokePath();

    // Store country ownership in the grid
    // This is a simplified approach; for complex polygons, you'd need a more robust point-in-polygon check or rasterization
    // Iterate through grid cells that roughly overlap with the polygon's bounding box
    const bounds = this.getPolygonBounds(polygonCoordinates);
    const startGridX = Math.floor(
      (bounds.minX - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
    );
    const endGridX = Math.ceil(
      (bounds.maxX - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
    );
    const startGridY = Math.floor(
      (bounds.minY - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
    );
    const endGridY = Math.ceil(
      (bounds.maxY - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
    );

    for (
      let y = Math.max(0, startGridY);
      y < Math.min(this.gridHeight, endGridY);
      y++
    ) {
      for (
        let x = Math.max(0, startGridX);
        x < Math.min(this.gridWidth, endGridX);
        x++
      ) {
        // Check if the center of the grid cell is inside the polygon
        const cellWorldX =
          x * this.gridSize +
          (this.offsetX - 180 * this.scaleFactor) +
          this.gridSize / 2;
        const cellWorldY =
          y * this.gridSize +
          (this.offsetY - 85 * this.scaleFactor) +
          this.gridSize / 2;
        const cellLonLat = this.worldToLonLat(cellWorldX, cellWorldY);

        // Use a simple ray-casting algorithm for point-in-polygon check
        if (this.isPointInPolygon(cellLonLat, polygonCoordinates)) {
          this.territoryGrid[y][x] = countryA3;
        }
      }
    }
  }

  getPolygonBounds(polygonCoordinates) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    polygonCoordinates.forEach((point) => {
      const worldPoint = this.lonLatToWorld(point[0], point[1]);
      minX = Math.min(minX, worldPoint.x);
      minY = Math.min(minY, worldPoint.y);
      maxX = Math.max(maxX, worldPoint.x);
      maxY = Math.max(maxY, worldPoint.y);
    });
    return { minX, minY, maxX, maxY };
  }

  isPointInPolygon(point, polygon) {
    // Ray-casting algorithm
    const x = point.lon,
      y = point.lat; // Use lon/lat for the check as polygon coords are in lon/lat
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0],
        yi = polygon[i][1];
      const xj = polygon[j][0],
        yj = polygon[j][1];

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Placeholder for lonLatToWorld - you need to implement this conversion
  lonLatToWorld(lon, lat) {
    // Implement Mercator projection to world coordinates
    // Reference: https://wiki.openstreetmap.org/wiki/Mercator
    const x =
      (lon + 180) * this.scaleFactor + (this.offsetX - 180 * this.scaleFactor);
    const latRad = (lat * Math.PI) / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = this.offsetY - mercN * this.scaleFactor; // Invert Y as Phaser has Y-down
    return { x, y };
  }

  // Placeholder for worldToLonLat - you need to implement this conversion
  worldToLonLat(x, y) {
    // Implement inverse Mercator projection from world to lon/lat
    const lon =
      (x - (this.offsetX - 180 * this.scaleFactor)) / this.scaleFactor - 180;
    const mercN = (this.offsetY - y) / this.scaleFactor;
    const latRad = 2 * Math.atan(Math.exp(mercN)) - Math.PI / 2;
    const lat = (latRad * 180) / Math.PI;
    return { lon, lat };
  }

  // Placeholder for addCity - you need to implement this
  addCity(lat, lon, name, isCapital, countryA3) {
    // Convert lat/lon to world coordinates
    const worldPoint = this.lonLatToWorld(lon, lat);

    // Create a graphic for the city
    let cityGraphic = this.add.circle(worldPoint.x, worldPoint.y, 5, 0xffff00); // Yellow circle
    cityGraphic.setStrokeStyle(1, 0x000000); // Black border
    cityGraphic.setDepth(1); // Ensure cities are above the map

    // Create text for the city name
    let cityNameText = this.add
      .text(worldPoint.x, worldPoint.y - 10, name, {
        font: "10px Arial",
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setDepth(1);

    // Group the graphic and text into a container for easier management
    let cityContainer = this.add.container(worldPoint.x, worldPoint.y, [
      cityGraphic,
      cityNameText,
    ]);
    cityContainer.setSize(10, 10); // Set a size for interaction

    // Add properties to the container
    cityContainer.lat = lat;
    cityContainer.lon = lon;
    cityContainer.cityName = name;
    cityContainer.isCapital = isCapital;
    cityContainer.country = countryA3; // Store the A3 country code
    cityContainer.population = 10000; // Initial population

    this.cityGroup.add(cityContainer); // Add to the city group
    this.capitals[countryA3] = cityContainer; // Store reference, assuming one capital per country for now

    console.log(`City added: ${name} (${countryA3}) at ${lat}, ${lon}`);
  }

  // Placeholder for startPopulationGrowth - you need to implement this
  startPopulationGrowth(cityName) {
    console.log(`Starting population growth for ${cityName}`);
    // Implement logic for population growth over time
    // Example: Find the city by name and start a timed event
    const city = Object.values(this.capitals).find(
      (c) => c.cityName === cityName
    );
    if (city) {
      this.time.addEvent({
        delay: 5000, // Every 5 seconds
        callback: () => {
          city.population += 100; // Increase population
          // Update city text or UI
          // console.log(`${city.cityName} population: ${city.population}`); // Too verbose
        },
        loop: true,
      });
    }
  }

  // Placeholder for addUnit - you need to implement this
  addUnit(lat, lon, troopCount, countryA3) {
    const worldPoint = this.lonLatToWorld(lon, lat);

    // Create a graphic for the unit (e.g., a small rectangle or circle)
    let unitGraphic = this.add.circle(0, 0, 8, 0x0000ff); // Blue circle
    unitGraphic.setStrokeStyle(1, 0x000000);

    // Create text for troop count
    let troopCountText = this.add
      .text(0, 0, troopCount, {
        font: "10px Arial",
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 1,
      })
      .setOrigin(0.5);

    // Create a container for the unit graphic and text
    let unitContainer = this.add.container(worldPoint.x, worldPoint.y, [
      unitGraphic,
      troopCountText,
    ]);
    unitContainer.setSize(16, 16); // Set a size for interaction

    // Add properties to the container
    unitContainer.troopCount = troopCount;
    unitContainer.country = countryA3; // Store the A3 country code
    unitContainer.lat = lat;
    unitContainer.lon = lon;

    unitContainer.setInteractive();
    unitContainer.on("pointerdown", () => {
      this.selectUnit(unitContainer);
    });

    this.troopGroup.add(unitContainer);
    console.log(
      `Unit added for ${countryA3}: ${troopCount} troops at ${lat}, ${lon}`
    );
  }

  // Placeholder for selectUnit - you need to implement this
  selectUnit(unit) {
    if (this.selectedUnit) {
      // Deselect previously selected unit
      if (this.selectedUnit.list[0] instanceof Phaser.GameObjects.Sprite) {
        this.selectedUnit.list[0].clearTint();
      }
    }
    this.selectedUnit = unit;
    // Apply a tint to indicate selection
    if (this.selectedUnit.list[0] instanceof Phaser.GameObjects.Sprite) {
      this.selectedUnit.list[0].setTint(0x00ff00); // Green tint
    }
    console.log(
      `Unit selected: ${unit.troopCount} troops from ${unit.country}`
    );
  }

  // Placeholder for isPointOnOwnedLand - you need to implement this
  isPointOnOwnedLand(worldPoint) {
    const gridX = Math.floor(
      (worldPoint.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
    );
    const gridY = Math.floor(
      (worldPoint.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
    );

    // Check if within grid bounds and if the territory is owned by the player
    return (
      gridY >= 0 &&
      gridY < this.gridHeight &&
      gridX >= 0 &&
      gridX < this.gridWidth &&
      this.territoryGrid[gridY] &&
      this.territoryGrid[gridY][gridX] === this.playerCountryA3
    );
  }

  // Placeholder for combineUnits - you need to implement this
  combineUnits() {
    if (this.selectedUnits.length < 2) {
      alert("Select at least two units to combine.");
      return;
    }

    const firstUnit = this.selectedUnits[0];
    const combinedCount = this.selectedUnits.reduce(
      (sum, unit) => sum + unit.troopCount,
      0
    );

    // Remove all selected units except the first one
    for (let i = 1; i < this.selectedUnits.length; i++) {
      this.selectedUnits[i].destroy();
      this.troopGroup.remove(this.selectedUnits[i]);
    }

    // Update the troop count of the first unit
    firstUnit.troopCount = combinedCount;
    firstUnit.list[1].setText(`${Math.round(firstUnit.troopCount)} troops`);
    this.selectedUnits = [firstUnit]; // Keep only the combined unit selected
    alert(`Units combined into one with ${Math.round(combinedCount)} troops!`);
  }

  // Placeholder for splitUnit - you need to implement this
  splitUnit() {
    if (!this.selectedUnit) {
      alert("Select a unit to split.");
      return;
    }

    const originalUnit = this.selectedUnit;
    const originalCount = originalUnit.troopCount;

    if (originalCount < 2) {
      alert("Unit is too small to split.");
      return;
    }

    const splitAmount = Math.floor(originalCount / 2);
    originalUnit.troopCount -= splitAmount;
    originalUnit.list[1].setText(
      `${Math.round(originalUnit.troopCount)} troops`
    );

    // Create a new unit at the same location
    this.addUnit(
      originalUnit.lat,
      originalUnit.lon,
      splitAmount,
      originalUnit.country
    );
    alert(
      `Unit split! Original: ${Math.round(
        originalUnit.troopCount
      )}, New: ${splitAmount}`
    );
  }

  // Placeholder for toggleGlobalSelection - you need to implement this
  toggleGlobalSelection() {
    this.globalSelectionActive = !this.globalSelectionActive;
    if (this.globalSelectionActive) {
      // Select all player's troops
      this.selectedUnits = this.troopGroup
        .getChildren()
        .filter((unit) => unit.country === this.playerCountryA3);
      this.selectedUnits.forEach((unit) => {
        if (unit.list[0] instanceof Phaser.GameObjects.Sprite) {
          unit.list[0].setTint(0x00ff00); // Green tint for selected
        }
      });
      alert("Global selection active! All your troops are selected.");
    } else {
      // Deselect all troops
      this.selectedUnits.forEach((unit) => {
        if (unit.list[0] instanceof Phaser.GameObjects.Sprite) {
          unit.list[0].clearTint();
        }
      });
      this.selectedUnits = [];
      alert("Global selection deactivated.");
    }
  }

  // Placeholder for toggleAreaSelection - you need to implement this
  toggleAreaSelection() {
    this.areaSelectionActive = !this.areaSelectionActive;
    if (this.areaSelectionActive) {
      alert("Area selection active. Click and drag to select units.");
      this.selectionStart = null;
      this.selectionGraphics.clear(); // Clear any previous selection visual
      this.input.on("pointerup", this.onPointerUpForAreaSelection, this); // Attach pointerup handler
    } else {
      alert("Area selection deactivated.");
      this.selectionGraphics.clear();
      this.input.off("pointerup", this.onPointerUpForAreaSelection, this); // Detach pointerup handler
      this.selectionStart = null;
      this.selectionEnd = null;
    }
  }

  // Placeholder for onPointerDownForAreaSelection - you need to implement this
  onPointerDownForAreaSelection(pointer) {
    let worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.selectionStart = { x: worldPoint.x, y: worldPoint.y };
    this.selectionEnd = { x: worldPoint.x, y: worldPoint.y }; // Initialize end to start
    this.selectionGraphics.clear();
    this.selectionGraphics.lineStyle(2, 0x00ff00); // Green outline
    this.selectionGraphics.fillStyle(0x00ff00, 0.3); // Green fill
  }

  // Placeholder for onPointerMoveForAreaSelection - you need to implement this
  onPointerMoveForAreaSelection(pointer) {
    if (this.selectionStart) {
      let worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.selectionEnd = { x: worldPoint.x, y: worldPoint.y };
      this.drawSelectionRectangle(this.selectionStart, this.selectionEnd);
    }
  }

  // Placeholder for onPointerUpForAreaSelection - you need to implement this
  onPointerUpForAreaSelection(pointer) {
    if (this.selectionStart && this.selectionEnd) {
      const rect = new Phaser.Geom.Rectangle(
        Math.min(this.selectionStart.x, this.selectionEnd.x),
        Math.min(this.selectionStart.y, this.selectionEnd.y),
        Math.abs(this.selectionStart.x - this.selectionEnd.x),
        Math.abs(this.selectionStart.y - this.selectionEnd.y)
      );

      this.selectedUnits = [];
      this.troopGroup.getChildren().forEach((unit) => {
        if (
          rect.contains(unit.x, unit.y) &&
          unit.country === this.playerCountryA3
        ) {
          this.selectedUnits.push(unit);
          if (unit.list[0] instanceof Phaser.GameObjects.Sprite) {
            unit.list[0].setTint(0x00ff00); // Green tint for selected
          }
        } else {
          if (unit.list[0] instanceof Phaser.GameObjects.Sprite) {
            unit.list[0].clearTint(); // Clear tint for unselected
          }
        }
      });
      console.log(`Selected ${this.selectedUnits.length} units.`);
    }
    this.selectionStart = null;
    this.selectionEnd = null;
    this.selectionGraphics.clear();
    this.toggleAreaSelection(); // Deactivate selection mode after area is chosen
  }

  // Helper to draw the selection rectangle
  drawSelectionRectangle(startPoint, endPoint) {
    this.selectionGraphics.clear();
    this.selectionGraphics.fillRect(
      Math.min(startPoint.x, endPoint.x),
      Math.min(startPoint.y, endPoint.y),
      Math.abs(startPoint.x - endPoint.x),
      Math.abs(startPoint.y - endPoint.y)
    );
    this.selectionGraphics.strokeRect(
      Math.min(startPoint.x, endPoint.x),
      Math.min(startPoint.y, endPoint.y),
      Math.abs(startPoint.x - endPoint.x),
      Math.abs(startPoint.y - endPoint.y)
    );
  }

  getGridCellsInArea(startPoint, endPoint) {
    const minWorldX = Math.min(startPoint.x, endPoint.x);
    const maxWorldX = Math.max(startPoint.x, endPoint.x);
    const minWorldY = Math.min(startPoint.y, endPoint.y);
    const maxWorldY = Math.max(startPoint.y, endPoint.y);

    const startGridX = Math.floor(
      (minWorldX - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
    );
    const endGridX = Math.ceil(
      (maxWorldX - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
    );
    const startGridY = Math.floor(
      (minWorldY - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
    );
    const endGridY = Math.ceil(
      (maxWorldY - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
    );

    const cells = [];
    for (
      let y = Math.max(0, startGridY);
      y < Math.min(this.gridHeight, endGridY);
      y++
    ) {
      for (
        let x = Math.max(0, startGridX);
        x < Math.min(this.gridWidth, endGridX);
        x++
      ) {
        cells.push({ x, y });
      }
    }
    return cells;
  }

  // Placeholder for splitAllTroops - you need to implement this
  splitAllTroops() {
    console.log("Splitting all troops.");
    this.troopGroup.getChildren().forEach((unit) => {
      const originalCount = unit.troopCount;
      if (originalCount >= 2) {
        const splitAmount = Math.floor(originalCount / 2);
        unit.troopCount -= splitAmount;
        unit.list[1].setText(`${Math.round(unit.troopCount)} troops`);
        this.addUnit(unit.lat, unit.lon, splitAmount, unit.country);
      }
    });
    alert("All applicable troops have been split!");
  }

  // Placeholder for updateTerrainColor - you need to implement this
  updateTerrainColor(worldPoint, colorHex, countryA3) {
    const gridX = Math.floor(
      (worldPoint.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize
    );
    const gridY = Math.floor(
      (worldPoint.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize
    );

    if (
      gridY >= 0 &&
      gridY < this.gridHeight &&
      gridX >= 0 &&
      gridX < this.gridWidth
    ) {
      this.territoryGrid[gridY][gridX] = countryA3; // Update the owner
      this.updatePixelColor(gridX, gridY, colorHex);
    }
  }

  // Helper to update a single pixel/grid cell color on the render texture
  updatePixelColor(gridX, gridY, colorHex) {
    if (!this.pixelDrawer) {
      console.warn("pixelDrawer not initialized.");
      return;
    }
    const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
    this.pixelDrawer.clear(); // Clear previous drawing
    this.pixelDrawer.fillStyle(color, 1);
    this.pixelDrawer.fillRect(
      gridX * this.gridSize + (this.offsetX - 180 * this.scaleFactor),
      gridY * this.gridSize + (this.offsetY - 85 * this.scaleFactor),
      this.gridSize,
      this.gridSize
    );
    // Draw this single pixel onto the main map render texture
    this.mapRenderTexture.draw(this.pixelDrawer, 0, 0);
  }

  // Placeholder for createUI - you need to implement this
  createUI() {
    console.log("Creating UI elements.");
    // Left Panel
    this.uiPanelLeft = this.add.graphics();
    this.uiPanelLeft.fillStyle(0x333333, 0.8);
    this.uiPanelLeft.fillRect(0, 0, 200, this.sys.game.config.height);
    this.uiPanelLeft.setScrollFactor(0); // Fixed to camera

    // Center Panel (for messages)
    this.uiPanelCenter = this.add.graphics();
    this.uiPanelCenter.fillStyle(0x333333, 0.8);
    this.uiPanelCenter.fillRect(
      this.sys.game.config.width / 2 - 150,
      0,
      300,
      60
    );
    this.uiPanelCenter.setScrollFactor(0);

    this.uiTextCenter = this.add
      .text(this.sys.game.config.width / 2, 30, "Welcome to the game!", {
        font: "20px Arial",
        fill: "#ffffff",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // Right Panel (for invasion status)
    this.uiPanelRight = this.add.graphics();
    this.uiPanelRight.fillStyle(0x333333, 0.8);
    this.uiPanelRight.fillRect(
      this.sys.game.config.width - 200,
      0,
      200,
      this.sys.game.config.height
    );
    this.uiPanelRight.setScrollFactor(0);

    // Invasion Status Panel
    this.invasionStatusPanel = this.add.graphics();
    this.invasionStatusPanel.fillStyle(0x555555, 0.9);
    this.invasionStatusPanel.fillRect(
      this.sys.game.config.width - 190,
      10,
      180,
      120
    );
    this.invasionStatusPanel.setScrollFactor(0);

    this.invasionStatusText = this.add
      .text(
        this.sys.game.config.width - 180,
        20,
        "Invasion Status:\nFrontlines: 0\nEnemy Land: 0\nLost Land: 0",
        { font: "16px Arial", fill: "#ffffff" }
      )
      .setScrollFactor(0);

    // Example button (replace with actual UI framework or proper button creation)
    const createTroopButton = document.createElement("button");
    createTroopButton.id = "createTroopButton";
    createTroopButton.textContent = "Create Troop";
    createTroopButton.style.position = "absolute";
    createTroopButton.style.top = "10px";
    createTroopButton.style.left = "10px";
    document.body.appendChild(createTroopButton);

    const buildCityButton = document.createElement("button");
    buildCityButton.id = "buildCityButton";
    buildCityButton.textContent = "Build City";
    buildCityButton.style.position = "absolute";
    buildCityButton.style.top = "50px";
    buildCityButton.style.left = "10px";
    document.body.appendChild(buildCityButton);
  }

  // Placeholder for updateUI - you need to implement this
  updateUI() {
    // Example: Update the center text based on game state
    if (this.uiTextCenter) {
      // Update uiTextCenter with relevant information (e.g., selected unit info)
      if (this.selectedUnit) {
        this.uiTextCenter.setText(
          `Selected Unit: ${Math.round(this.selectedUnit.troopCount)} troops (${
            this.selectedUnit.country
          })`
        );
      } else if (this.globalSelectionActive) {
        this.uiTextCenter.setText(
          `Global Selection: ${this.selectedUnits.length} units selected.`
        );
      } else {
        this.uiTextCenter.setText(
          "Click units to select or press 'U' for global selection."
        );
      }
    }
    // Update invasion status panel
    let frontlines = 0;
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (
          this.territoryControl[y] &&
          this.territoryControl[y][x] > 30 &&
          this.territoryControl[y][x] < 70
        ) {
          // Add bounds check
          frontlines++;
        }
      }
    }

    // Use the stored playerCountryA3
    const selectedCountry = this.playerCountryA3;
    let enemyTerritoryControlled = 0;
    let friendlyTerritoryLost = 0;

    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.territoryGrid[y] && this.territoryGrid[y][x]) {
          // Add bounds check
          if (
            this.territoryGrid[y][x] !== selectedCountry &&
            this.territoryControl[y] &&
            this.territoryControl[y][x] > 60
          ) {
            // Add bounds check
            enemyTerritoryControlled++;
          } else if (
            this.territoryGrid[y][x] === selectedCountry &&
            this.territoryControl[y] &&
            this.territoryControl[y][x] < 40
          ) {
            // Add bounds check
            friendlyTerritoryLost++;
          }
        }
      }
    }

    // Ensure this.invasionStatusText exists before calling setText on it
    if (this.invasionStatusText) {
      this.invasionStatusText.setText(
        `Invasion Status:\n` +
          `Frontlines: ${frontlines}\n` +
          `Enemy Land: ${enemyTerritoryControlled}\n` +
          `Lost Land: ${friendlyTerritoryLost}`
      );
    }
  }
}
