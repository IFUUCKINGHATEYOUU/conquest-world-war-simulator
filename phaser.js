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
        const worldMapHeight = mercatorLatRange * this.scaleFactor; // Corrected calculation for mercator height

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

        console.log("DEBUG: Building country code map from capitals data and adding cities.");
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

                 console.warn(`Capital entry with A2 only found: ${countryA2}. Using A2 uppercase as fallback A3: ${fallbackA3Upper}`);

            } else {
                 console.warn("Capital feature missing both A3 and A2 codes:", feature.properties);
                 return; // Skip adding city if no codes
            }

             this.startPopulationGrowth(capitalName);
             processedCapitals++;
             if (
                 processedCapitals % 50 === 0 ||
                 processedCapitals === totalCapitals
             ) {
                 this.loadingSubText.setText(
                     `Processing capitals and mapping codes: ${processedCapitals}/${totalCapitals}`
                 );
             }
        });

         // After processing capitals, also add mappings from countryData keys (A2 lowercase) to their corresponding A3 if known
         // This helps link A2 codes from countryData to A3 codes derived from capitals or fallbacks.
         Object.keys(this.countryData).forEach(a2CodeLower => {
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
        this.playerCountryA3 = this.getA3CodeFromAny(localStorageCountry) || 'USA'; // Default to USA A3 if resolution fails

        console.log(`DEBUG: Player selected country from localStorage: "${localStorageCountry}". Resolved A3: "${this.playerCountryA3}". countryCodeMap[String(localStorageCountry).toUpperCase()]: ${this.countryCodeMap[String(localStorageCountry).toUpperCase()]}`);
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
        countriesData.features.forEach((feature) => { // Corrected: Removed extra .features
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
                 console.warn(`Could not resolve A3 code for ${countryCode} from map data. Skipping polygon render.`);
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
         Object.keys(this.countryColors).forEach(countryA3 => {
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
                 const worldX = foundCell.x * this.gridSize + (this.offsetX - 180 * this.scaleFactor) + this.gridSize / 2;
                 const worldY = foundCell.y * this.gridSize + (this.offsetY - 85 * this.scaleFactor) + this.gridSize / 2;

                  // Find the country name from countryData using the A3 code
                 let countryName = countryA3; // Default to A3 code
                 let countryA2Lower = this.getA2CodeFromA3(countryA3);
                  if (countryA2Lower && this.countryData[countryA2Lower] && this.countryData[countryA2Lower].name) {
                       countryName = this.countryData[countryA2Lower].name;
                  }


                 const nameText = this.add.text(worldX, worldY, countryName, {
                     font: 'Bold 20px Arial', // Adjust font size and style as needed
                     fill: '#ffffff', // White text color
                     stroke: '#000000', // Black stroke for readability
                     strokeThickness: 2,
                     wordWrap: { width: this.gridSize * 10, useAdvancedWrap: true }, // Increased word wrap width
                     align: 'center' // Center align multi-line text
                 }).setOrigin(0.5).setDepth(2); // Set origin to center, higher depth

                 this.countryNameGroup.add(nameText); // Add to the group
                 this.countryNameTexts[countryA3] = nameText; // Store reference
                 // No need for 'placedCountries' set with this iteration method
             }
         });
         console.log(`DEBUG: Placed names for ${Object.keys(this.countryNameTexts).length} countries.`);
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
             } else if (this.areaCaptureActive) { // NEW: Check for area capture mode
                 this.onPointerDownForAreaCapture(pointer); // NEW handler for capture
                 return; // Stop further processing if area capture is active
             }


            let worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

            // Handle global selection movement
            if (
                this.globalSelectionActive &&
                this.selectedUnits.length > 0
            ) {
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
            else if (
                this.selectedUnit
            ) {
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
            } else if (this.areaCaptureActive) { // NEW: Check for area capture mode
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
        console.log(`DEBUG INVASION: Setting initial control for player country: ${selectedCountryA3}`);
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.territoryGrid[y] && this.territoryGrid[y][x] === selectedCountryA3) { // Compare with A3, add bounds check
                    this.territoryControl[y][x] = 100;
                }
            }
        }
         console.log("DEBUG INVASION: initializeInvasionSystems finished. Initial territoryControl state:", this.territoryControl);
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
         this.unitsAutoCapturing.forEach(unit => {
             // Check if unit is currently tweening or has moved
             if (unit.tween || unit.lastPosition) {
                  const hasMoved = !unit.lastPosition || unit.x !== unit.lastPosition.x || unit.y !== unit.lastPosition.y;
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
         this.troopGroup.getChildren().forEach(unit => {
              // This is a basic check, can be refined to only track units currently ordered to move
              if (unit.tween) {
                  const hasMoved = !unit.lastPosition || unit.x !== unit.lastPosition.x || unit.y !== unit.lastPosition.y;
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
         Object.keys(this.countryNameTexts).forEach(countryA3 => {
              const nameText = this.countryNameTexts[countryA3];
              if (nameText) {
                  // Find the grid cell where the text is placed
                  const textGridX = Math.floor((nameText.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize);
                  const textGridY = Math.floor((nameText.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize);

                   // Check if the grid cell is within bounds
                  if (textGridY >= 0 && textGridY < this.gridHeight && textGridX >= 0 && textGridX < this.gridWidth) {
                      const currentOwnerA3 = this.territoryGrid[textGridY] ? this.territoryGrid[textGridY][textGridX] : null; // Add bounds check

                       if (currentOwnerA3 && this.countryColors[currentOwnerA3]) {
                            const ownerColorHex = this.countryColors[currentOwnerA3];

                            try {
                                 // Attempt to convert hex string to integer color value
                                 const ownerColorInt = parseInt(ownerColorHex.replace(/^#/, ''), 16);

                                 // Check if parsing was successful and the color is valid
                                 if (!isNaN(ownerColorInt)) {
                                      // Convert integer color to HSV
                                      const hsvColor = Phaser.Display.Color.IntegerToHSV(ownerColorInt);

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
                                           const rgbColor = Phaser.Display.Color.HSVToRGB(hsvColor.h, hsvColor.s, hsvColor.v);

                                           if (rgbColor) {
                                                // Manually convert RGB to Hex String
                                                // Ensure RGB values are clamped to 0-255
                                                const r = Math.max(0, Math.min(255, Math.round(rgbColor.r)));
                                                const g = Math.max(0, Math.min(255, Math.round(rgbColor.g)));
                                                const b = Math.max(0, Math.min(255, Math.round(rgbColor.b)));

                                                const finalColorHex = '#' +
                                                     r.toString(16).padStart(2, '0') +
                                                     g.toString(16).padStart(2, '0') +
                                                     b.toString(16).padStart(2, '0');

                                                nameText.setColor(finalColorHex);

                                           } else {
                                                console.warn("Failed to convert HSV back to RGB for text color:", hsvColor);
                                                nameText.setColor('#808080'); // Default to grey
                                           }
                                      } else {
                                           console.warn("Failed to convert integer color to HSV for text color:", ownerColorInt, ownerColorHex);
                                           nameText.setColor('#808080'); // Default to grey
                                      }
                                 } else {
                                      console.warn("Failed to parse hex string to integer color for text color:", ownerColorHex);
                                      nameText.setColor('#808080'); // Default to grey
                                 }

                            } catch (e) {
                                 console.error(`Error processing color for text ${countryA3} with hex ${ownerColorHex}:`, e);
                                 nameText.setColor('#808080'); // Default to grey on error
                            }

                       } else {
                            // If the tile is unowned or country color not found, maybe default to grey
                             nameText.setColor('#808080');
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
        this.occupyingForces.forEach(row => row.fill([]));

        // Track which units are in which grid cells
        this.troopGroup.getChildren().forEach(unit => {
            const gridX = Math.floor((unit.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize);
            const gridY = Math.floor((unit.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize);

            if (gridY >= 0 && gridY < this.gridHeight && gridX >= 0 && gridX < this.gridWidth) {
                this.occupyingForces[gridY][gridX] = this.occupyingForces[gridY][gridX].concat(unit);
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
        this.troopGroup.getChildren().forEach(unit => {
            const gridX = Math.floor((unit.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize);
            const gridY = Math.floor((unit.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize);

            if (gridY >= 0 && gridY < this.gridHeight && gridX >= 0 && gridX < this.gridWidth) {
                // Check supply lines
                const supplyEffectiveness = this.checkSupplyLines(unit, gridX, gridY);
                 // console.log(`DEBUG INVASION: Unit at [${gridX},${gridY}] supply effectiveness: ${supplyEffectiveness.toFixed(2)}`); // Too verbose

                // Apply attrition in enemy territory
                if (this.territoryGrid[gridY] && this.territoryGrid[gridY][gridX] && this.territoryGrid[gridY][gridX] !== unit.country) { // unit.country is A3 uppercase, Add bounds/null checks
                    const attritionRate = this.baseAttritionRate * (1 - supplyEffectiveness * 0.5);
                    const attritionAmount = unit.troopCount * attritionRate * (delta / 1000); // Attrition per second
                    const newTroopCount = Math.max(1, unit.troopCount - attritionAmount);
                    console.log(`DEBUG INVASION: Attrition on unit at [${gridX},${gridY}] (${unit.country}): Rate=${attritionRate.toFixed(4)}, Amount=${attritionAmount.toFixed(2)}. New count: ${Math.round(newTroopCount)}`); // Corrected log message with correct variable name
                    unit.troopCount = newTroopCount;
                    unit.list[1].setText(`${Math.round(unit.troopCount)} troops`);
                }

                // Exert influence (3x3 area)
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const ny = gridY + dy;
                        const nx = gridX + dx;
                        if (ny >= 0 && ny < this.gridHeight && nx >= 0 && nx < this.gridWidth) {
                            const distanceFactor = dx === 0 && dy === 0 ? 1 : 0.3;
                            const influence = (unit.troopCount / 10000) * distanceFactor * supplyEffectiveness;

                            if (this.territoryGrid[ny] && this.territoryGrid[ny][nx] === unit.country) { // unit.country is A3 uppercase, Add bounds/null checks
                                newControl[ny][nx] += influence; // Reinforce
                                 // console.log(`DEBUG INVASION: Unit at [${gridX},${gridY}] reinforces friendly tile [${nx},${ny}]. Influence: ${influence.toFixed(2)}`); // Too verbose
                            } else if (this.territoryGrid[ny] && this.territoryGrid[ny][nx]) { // Only apply negative influence on owned land
                                newControl[ny][nx] -= influence; // Attack
                                 // console.log(`DEBUG INVASION: Unit at [${gridX},${gridY}] attacks enemy tile [${nx},${ny}] (${this.territoryGrid[ny][nx]}). Influence: ${(-influence).toFixed(2)}`); // Too verbose
                            }
                        }
                    }
                }
            }
        });

        // Apply control changes
         let captureCount = 0;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                 if (this.territoryGrid[y] && this.territoryGrid[y][x]) { // Only process land tiles
                    const previousControl = this.territoryControl[y][x];
                    this.territoryControl[y][x] = Phaser.Math.Clamp(
                        previousControl + newControl[y][x] * (delta / 1000), // Scale influence by delta time
                        0,
                        100
                    );
                    if (newControl[y][x] !== 0) {
                         // console.log(`DEBUG INVASION: Tile [${x},${y}] control change: ${newControl[y][x].toFixed(2)} * ${delta/1000}. Old control: ${previousControl.toFixed(2)}, New control: ${this.territoryControl[y][x].toFixed(2)}`); // Too verbose
                    }


                    // Territory captured!
                    if (this.territoryControl[y][x] >= 100) { // Check >= 100 for capture
                         const dominantOccupantA3 = this.getDominantOccupant(x, y);
                         if (dominantOccupantA3 && this.territoryGrid[y][x] !== dominantOccupantA3) { // Only change if new occupant is valid and different
                            console.log(`DEBUG INVASION: Territory [${x},${y}] CAPTURED by ${dominantOccupantA3} from ${this.territoryGrid[y][x]}.`);
                            this.territoryGrid[y][x] = dominantOccupantA3; // getDominantOccupant returns A3 uppercase

                             // --- NEW: Remove captured tile from auto-capture targets ---
                             const capturedTargetIndex = this.autoCaptureTargets.findIndex(target => target.x === x && target.y === y);
                             if (capturedTargetIndex !== -1) {
                                  this.autoCaptureTargets.splice(capturedTargetIndex, 1); // Remove the captured target
                                  console.log(`DEBUG AUTO-CAPTURE: Removed captured tile [${x},${y}] from autoCaptureTargets.`);
                             }
                             // --- END NEW ---


                            this.updateTerrainColor(
                                {
                                    x: x * this.gridSize + (this.offsetX - 180 * this.scaleFactor),
                                    y: y * this.gridSize + (this.offsetY - 85 * this.scaleFactor)
                                },
                                 this.countryColors[this.territoryGrid[y][x]] || "#FFFFFF", // Look up color by A3 uppercase
                                this.territoryGrid[y][x] // Pass A3 uppercase
                            );
                            this.territoryControl[y][x] = 50; // Reset to neutral after capture
                            captureCount++;
                        } else if (this.territoryGrid[y][x] === dominantOccupantA3) {
                            // Reached 100% control for the existing owner, just clamp
                            this.territoryControl[y][x] = 100;
                        } else {
                            // Reached 100% control but no dominant occupant (e.g., defenders wiped out after control reached 100), reset to neutral
                             this.territoryControl[y][x] = 50;
                             // console.log(`DEBUG INVASION: Tile [${x},${y}] reached 100% control but no dominant occupant found. Resetting to 50.`); // Too verbose
                         }
                    } else if (this.territoryControl[y][x] <= 0) { // Also handle losing 100% control
                         const dominantOccupantA3 = this.getDominantOccupant(x, y);
                         if (dominantOccupantA3 && this.territoryGrid[y] && this.territoryGrid[y][x] !== dominantOccupantA3) {
                              console.log(`DEBUG INVASION: Territory [${x},${y}] LOST by ${this.territoryGrid[y][x]} to ${dominantOccupantA3}.`);
                               this.territoryGrid[y][x] = dominantOccupantA3;
                                this.updateTerrainColor(
                                    {
                                        x: x * this.gridSize + (this.offsetX - 180 * this.scaleFactor),
                                        y: y * this.gridSize + (this.offsetY - 85 * this.scaleFactor)
                                    },
                                     this.countryColors[this.territoryGrid[y][x]] || "#FFFFFF",
                                    this.territoryGrid[y][x]
                                );
                                this.territoryControl[y][x] = 50;
                                captureCount++; // Count as a loss for the previous owner/gain for the new
                         } else if (this.territoryGrid[y] && this.territoryGrid[y][x] === dominantOccupantA3) {
                             // Lost all control but still occupied by friendly forces, clamp
                             this.territoryControl[y][x] = 0;
                         } else {
                            // Lost all control but no dominant occupant, reset to neutral
                             this.territoryControl[y][x] = 50;
                             // console.log(`DEBUG INVASION: Tile [${x},${y}] reached 0% control but no dominant occupant found. Resetting to 50.`); // Too verbose
                         }
                    }
                }
            }
        }
         if (captureCount > 0) {
              console.log(`DEBUG INVASION: ${captureCount} territories changed hands this update cycle.`);
         }
         // console.log("DEBUG INVASION: updateTerritoryControl finished."); // Too verbose

        // Update control visualization
        this.drawControlOverlay();
    }

    checkSupplyLines(unit, gridX, gridY) {
        // Fast check if already in friendly territory
        if (this.territoryGrid[gridY] && this.territoryGrid[gridY][gridX] === unit.country) {
            return 1.0; // unit.country is A3 uppercase, territoryGrid stores A3 or null, add bounds check
        }

        let nearestFriendly = Infinity;
        const searchRadius = this.supplyRange;

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const ny = gridY + dy;
                const nx = gridX + dx;
                if (ny >= 0 && ny < this.gridHeight && nx >= 0 && nx < this.gridWidth) {
                    if (this.territoryGrid[ny] && this.territoryGrid[ny][nx] === unit.country) { // unit.country is A3 uppercase, add bounds check
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        nearestFriendly = Math.min(nearestFriendly, distance);
                    }
                }
            }
        }

        // Effectiveness drops exponentially with distance
        if (nearestFriendly <= searchRadius) {
            const effectiveness = Phaser.Math.Easing.Quadratic.Out(1 - (nearestFriendly / searchRadius));
            return effectiveness;
        }
        return 0.2; // Minimal effectiveness when completely cut off
    }

    getDominantOccupant(x, y) {
        const forceCounts = {}; // Keyed by A3 uppercase
        // Add bounds check before accessing occupyingForces
        if (this.occupyingForces[y] && this.occupyingForces[y][x]) {
            this.occupyingForces[y][x].forEach(unit => { // unit.country is A3 uppercase
                forceCounts[unit.country] = (forceCounts[unit.country] || 0) + unit.troopCount;
            });
        }

        if (Object.keys(forceCounts).length === 0) {
             // If no forces, dominant occupant is the current owner (if any)
             const currentOwner = this.territoryGrid[y] ? this.territoryGrid[y][x] : null;
            return currentOwner;
        }

        // Find the country with the maximum force count (will return an A3 uppercase code)
        const dominantA3 = Object.keys(forceCounts).reduce((a, b) =>
            forceCounts[a] > forceCounts[b] ? a : b
        );

        // If the dominant force is significantly stronger than the second strongest, consider them the dominant occupant.
        // This prevents flip-flopping with small numbers.
        const sortedForces = Object.entries(forceCounts).sort(([,a],[,b]) => b - a);
        if (sortedForces.length > 1) {
            const [firstCountry, firstForce] = sortedForces[0];
            const [secondCountry, secondForce] = sortedForces[1];
            if (firstForce > secondForce * 1.5) { // Dominant force is at least 1.5 times stronger
                return firstCountry;
            } else {
                // Contested, current owner holds for now
                 const currentOwner = this.territoryGrid[y] ? this.territoryGrid[y][x] : null;
                 return currentOwner;
            }
        } else {
             // Only one country's forces present
             return sortedForces[0][0];
        }
    }

    drawControlOverlay() {
        this.controlGraphics.clear();

        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // let drawnTiles = 0; // For debugging

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                 // Add bounds check before accessing territoryControl
                 if (this.territoryControl[y] && this.territoryControl[y][x] > 0 && this.territoryControl[y][x] < 100) {
                    const worldX = x * this.gridSize + (this.offsetX - 180 * this.scaleFactor);
                    const worldY = y * this.gridSize + (this.offsetY - 85 * this.scaleFactor);

                    // Calculate color based on control
                    const control = this.territoryControl[y][x];
                    // Compare territory ownership (A3) with the selected country (A3)
                    const isFriendly = this.territoryGrid[y] && this.territoryGrid[y][x] === selectedCountryA3; // Add bounds check

                    let color;
                    if (isFriendly) {
                        // Friendly territory being attacked (reddish)
                        const strength = (100 - control) / 100;
                        color = Phaser.Display.Color.Interpolate.ColorWithColor(
                            Phaser.Display.Color.ValueToColor(0x00aa00), // Green for full friendly control
                            Phaser.Display.Color.ValueToColor(0xaa0000), // Red for full enemy control
                            100, // Total range
                            strength * 100 // Position within the range
                        );
                    } else {
                        // Enemy territory being captured (greenish)
                        const strength = control / 100;
                         color = Phaser.Display.Color.Interpolate.ColorWithColor(
                             Phaser.Display.Color.ValueToColor(0xaa0000), // Red for full enemy control
                             Phaser.Display.Color.ValueToColor(0x00aa00), // Green for full friendly control
                             100, // Total range
                             strength * 100 // Position within the range
                         );
                    }

                    // More transparent for less intense conflicts (control closer to 50 is more intense)
                    const alpha = 0.5 - Math.abs(control - 50) / 100; // Max alpha 0.5 at 50% control, min 0 at 0 or 100
                    this.controlGraphics.fillStyle(color.color, alpha);
                    this.controlGraphics.fillRect(worldX, worldY, this.gridSize, this.gridSize);
                    // drawnTiles++; // For debugging
                }
            }
        }
        // console.log(`DEBUG INVASION: drawControlOverlay finished. Drawn ${drawnTiles} tiles.`); // Too verbose
    }


    // --- Helper Functions (Moved to be class methods) ---
    generateUniqueColor(existingColors) {
        let color;
        do {
            color =
                "#" +
                Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, "0");
        } while (existingColors.includes(color));
        return color;
    }

     getCountryColor(properties) {
         // Determine the primary country identifier from the properties (preferably A3).
         const identifier =
             properties.A3 ||
             properties.iso_a3 ||
             properties.iso_a2 ||
             properties.name;
         const identifierUpper = identifier
             ? String(identifier).toUpperCase() // Ensure string and uppercase
             : "UNKNOWN_COUNTRY";
         // console.log(`DEBUG: getCountryColor called for: ${JSON.stringify(properties)}. Derived identifierUpper: ${identifierUpper}`); // Too verbose

         // Use the countryCodeMap to get the definitive A3 uppercase for this identifier
         let a3CodeUpper = this.countryCodeMap[identifierUpper];


         // Now, use the derived A3 uppercase code to look up the color in this.countryData,
         // but first find the corresponding A2 lowercase for countryData.
         if (a3CodeUpper) {
             let a2LowerCode = this.getA2CodeFromA3(a3CodeUpper);


             if (
                 a2LowerCode &&
                 this.countryData &&
                 this.countryData[a2LowerCode] &&
                 this.countryData[a2LowerCode].color
             ) {
                 const predefinedColor = this.countryData[a2LowerCode].color;
                 // console.log( `DEBUG: Predefined color "${predefinedColor}" found in countryData for A2 code "${a2LowerCode}" (mapped from ${identifierUpper}).`); // Too verbose
                 // Store the predefined color in countryColors using the A3 uppercase code.
                 this.countryColors[a3CodeUpper] = predefinedColor; // Store color keyed by A3 uppercase
                 return predefinedColor;
             } else {
                 // console.log(`DEBUG: Fallback to random color for ${identifierUpper}. Details: a3CodeUpper=${a3CodeUpper}, a2LowerCode=${a2LowerCode}, countryDataExists=${!!this.countryData}, countryData[a2LowerCode]Exists=${!!(this.countryData && this.countryData[a2LowerCode])}, colorExists=${!!(this.countryData && this.countryData[a2LowerCode] && this.countryData[a2LowerCode].color)}`); // Too verbose
             }
         } else {
             console.warn(
                 `getCountryColor: Could not find A3 uppercase code in countryCodeMap for identifier "${identifierUpper}". Generating random color.`
             );
         }


         // If no predefined color was found, generate a unique random color.
         // Check if a random color has already been generated and stored for this identifier (using the resolved A3 or the original identifier if A3 not found).
         const keyForColorStorage = a3CodeUpper || identifierUpper; // Use A3 uppercase if found, otherwise original identifier
         if (!this.countryColors[keyForColorStorage]) {
             // console.log(`DEBUG: Generating new unique random color for ${keyForColorStorage}.`); // Too verbose
             const usedColors = Object.values(this.countryColors);
             this.countryColors[keyForColorStorage] =
                 this.generateUniqueColor(usedColors); // Store color keyed by A3 uppercase (or original identifier)
         } else {
             // console.log(`DEBUG: Using existing random color for ${keyForColorStorage}: ${this.countryColors[keyForColorStorage]}`); // Too verbose
         }
         return this.countryColors[keyForColorStorage]; // Return color for A3 uppercase (or original identifier)
     }


    convertCoords(lat, lon) {
        // Converts geographical coordinates to game world coordinates.
        // Offsets ensure the map's (0,0 lat/lon) is at the center of the canvas initially.
        return {
            x: lon * this.scaleFactor + this.offsetX,
            y: this.offsetY - lat * this.scaleFactor,
        };
    }

    initializeTerritoryGrid() {
        // Calculate world dimensions based on scaleFactor for the entire map
        const worldMapWidth = 360 * this.scaleFactor;
        const mercatorLatRange = 170.1;
        const worldMapHeight = mercatorLatRange * this.scaleFactor;

        this.gridWidth = Math.ceil(worldMapWidth / this.gridSize);
        this.gridHeight = Math.ceil(worldMapHeight / this.gridSize);
        this.territoryGrid = new Array(this.gridHeight)
            .fill(null)
            .map(() => new Array(this.gridWidth).fill(null)); // Stores A3 codes or null
    }

    isPointOnOwnedLand(worldPoint) {
        // Convert worldPoint to coordinates relative to the renderTexture's top-left
        const worldMapWidth = 360 * this.scaleFactor;
        const worldMapHeight = 170.1 * this.scaleFactor;
        const textureX = worldPoint.x - (this.offsetX - worldMapWidth / 2);
        const textureY = worldPoint.y - (this.offsetY - worldMapHeight / 2);

        let gridX = Math.floor(textureX / this.gridSize);
        let gridY = Math.floor(textureY / this.gridSize);

        // Check if the grid coordinates are within bounds
        if (
            gridY >= 0 &&
            gridY < this.gridHeight &&
            gridX >= 0 &&
            gridX < this.gridWidth
        ) {
            // Use the stored playerCountryA3
            let selectedCountryA3 = this.playerCountryA3;
            // Compare with the country code (A3 or null) stored in the territory grid
            return (
                this.territoryGrid[gridY] &&
                this.territoryGrid[gridY][gridX] === selectedCountryA3
            );
        }
        return false;
    }


    updateTerrainColor(pos, countryColor, countryA3) {
        // countryA3 is expected to be A3 uppercase
        // pos (x,y) are game world coordinates of the troop/city.
        // Need to convert to coordinates relative to the renderTexture's top-left
        const worldMapWidth = 360 * this.scaleFactor;
        const worldMapHeight = 170.1 * this.scaleFactor;
        const textureX = pos.x - (this.offsetX - worldMapWidth / 2);
        const textureY = pos.y - (this.offsetY - worldMapHeight / 2);

        let gridX = Math.floor(textureX / this.gridSize);
        let gridY = Math.floor(textureY / this.gridSize);

        // Ensure coordinates are within bounds before drawing
        if (
            gridY >= 0 &&
            gridY < this.gridHeight &&
            gridX >= 0 &&
            gridX < this.gridWidth
        ) {
            // Check if the grid cell is land and if it belongs to the country being updated
            // Only update terrain color if the land belongs to the country of the unit/city
             if (!this.territoryGrid[gridY] || this.territoryGrid[gridY][gridX] !== countryA3) { // Add bounds check and use gridY, gridX
                return; // Do not color ocean tiles or land not owned by this country
            }

            let colorToUse = countryColor;
            if (!colorToUse || colorToUse === "#FFFFFF") {
                // If no color was passed or it was the default, get it using the A3 code
                if (countryA3) {
                     colorToUse = this.countryColors[countryA3] || "#000000"; // Look up color by A3 uppercase from countryColors
                } else {
                    colorToUse = "#000000"; // Fallback for unassigned/default
                }
            }

            // Clear the previous drawing on pixelDrawer
            this.pixelDrawer.clear();
            this.pixelDrawer.fillStyle(
                Phaser.Display.Color.HexStringToColor(colorToUse).color,
                1
            );
            // Draw a rectangle for the grid cell.
            // The coordinates are relative to pixelDrawer's origin (0,0).
            this.pixelDrawer.fillRect(
                gridX * this.gridSize,
                gridY * this.gridSize,
                this.gridSize,
                this.gridSize
            );
            // Draw the content of pixelDrawer onto the main map render texture at its top-left (0,0).
            // The content of pixelDrawer is already in the correct texture-local coordinates.
            this.mapRenderTexture.draw(this.pixelDrawer, 0, 0);
        }
    }


    renderAndStorePolygon(coords, countryCodeA3) {
        // countryCodeA3 is expected to be A3 uppercase now
        // console.log( `DEBUG: ENTERING renderAndStorePolygon for countryCodeA3: ${countryCodeA3}`); // Too verbose
        if (!coords || !coords.length) {
            console.warn(
                `renderAndStorePolygon: No coordinates for ${countryCodeA3}`
            );
            return;
        }

        // Use the provided A3 uppercase code directly
        let countryCodeA3Upper = countryCodeA3;


        // Calculate world dimensions for coordinate conversion
        const worldMapWidth = 360 * this.scaleFactor;
        const worldMapHeight = 170.1 * this.scaleFactor;
        // Convert GeoJSON coordinates to game world coordinates, then adjust to texture coordinates
        let gamePoints = coords.map((coord) => {
            let p = this.convertCoords(coord[1], coord[0]);
            // Adjust points to be relative to the renderTexture's top-left (0,0)
            let textureX = p.x - (this.offsetX - worldMapWidth / 2);
            let textureY = p.y - (this.offsetY - worldMapHeight / 2);
            return new Phaser.Geom.Point(textureX, textureY);
        });
        // Get the bounds of the polygon using Phaser.Geom.Rectangle.FromPoints (these bounds are in texture coordinates)
        let bounds = Phaser.Geom.Rectangle.FromPoints(gamePoints);
        // console.log( `DEBUG: Polygon bounds for ${countryCodeA3}: X=${bounds.x}, Y=${bounds.y}, Width=${bounds.width}, Height=${bounds.height}`); // Too verbose

        // Fill the grid based on the polygon
        let polygon = new Phaser.Geom.Polygon(gamePoints);
        // Use texture-relative points for the polygon

        // These grid coordinates refer to the renderTexture's dimensions
        let startGridX = Math.max(0, Math.floor(bounds.x / this.gridSize));
        let endGridX = Math.min(
            this.gridWidth,
            Math.ceil(bounds.right / this.gridSize)
        );
        let startGridY = Math.max(0, Math.floor(bounds.y / this.gridSize));
        let endGridY = Math.min(
            this.gridHeight,
            Math.ceil(bounds.bottom / this.gridSize)
        );
        // Get the color for the country using the A3 uppercase code
        // Ensure color is in countryColors by calling getCountryColor if needed
        let hexColor = this.countryColors[countryCodeA3Upper] || this.getCountryColor({ A3: countryCodeA3Upper });

        // console.log(`DEBUG: Hex color determined for ${countryCodeA3Upper}: ${hexColor}`); // Too verbose
        // console.log(`DEBUG: Rendering ${countryCodeA3Upper} with color: ${hexColor}`); // Too verbose
        let color = Phaser.Display.Color.HexStringToColor(hexColor).color;
        this.mapDrawer.fillStyle(color, 1); // Set fill style on the same drawer

        for (let y = startGridY; y < endGridY; y++) {
            for (let x = startGridX; x < endGridX; x++) {
                // worldX and worldY are now relative to the render texture's top-left
                let pixelCenterX = x * this.gridSize + this.gridSize / 2;
                let pixelCenterY = y * this.gridSize + this.gridSize / 2;
                if (Phaser.Geom.Polygon.Contains(polygon, pixelCenterX, pixelCenterY)) {
                    // Ensure the grid cell is within bounds before assignment
                    if (this.territoryGrid[y] && x >= 0 && x < this.gridWidth) {
                        this.territoryGrid[y][x] = countryCodeA3Upper; // Assign A3 uppercase code to grid cell
                        this.mapDrawer.fillRect(
                            x * this.gridSize,
                            y * this.gridSize,
                            this.gridSize,
                            this.gridSize
                        );
                    } else {
                        console.warn(
                            `renderAndStorePolygon: Attempted to write outside grid bounds at [${y}][${x}] for ${countryCodeA3Upper}`
                        );
                    }
                }
            }
        }
        // IMPORTANT: No drawing to mapRenderTexture here. It will happen once at the end of create().
    }


    addCity(lat, lon, cityName, isCapital, countryCodeA3) {
        // countryCodeA3 is expected to be A3 uppercase
        let pos = this.convertCoords(lat, lon);
        let color = isCapital ? 0xffd700 : 0x0000ff;
        let radius = isCapital ? 8 : 5;
        let cityCircle = this.add.circle(0, 0, radius, color);
        let label = this.add.text(0, -radius - 10, `${cityName}\nPop: 0`, {
            font: "14px Arial",
            fill: "#ffffff",
        });
        label.setOrigin(0.5); // Center the label
        label.setVisible(false);
        let container = this.add.container(pos.x, pos.y, [cityCircle, label]);
        container.setSize(radius * 2, radius * 2);
        container.setInteractive(
            new Phaser.Geom.Circle(0, 0, radius),
            Phaser.Geom.Circle.Contains
        );
        container.on("pointerover", () => label.setVisible(true));
        container.on("pointerout", () => label.setVisible(false));
        this.cityGroup.add(container);
        if (isCapital && countryCodeA3) {
            // Store capital keyed by A3 uppercase
            this.capitals[String(countryCodeA3).toUpperCase()] = container; // Ensure string and uppercase
        }
        this.cityContainers[cityName] = container; // Store all cities by name
    }


    startPopulationGrowth(cityName) {
        this.time.addEvent({
            delay: 1000,
            callback: () => {
                let container = this.cityContainers[cityName];
                if (container) {
                    let label = container.list[1];
                    let lines = label.text.split("\n");
                    let currentPop = parseInt(lines[1].replace("Pop: ", "")) || 0;
                    currentPop += 1000;
                    label.setText(`${cityName}\nPop: ${currentPop}`);
                }
            },
            loop: true,
        });
    }


    addUnit(lat, lon, troopCount, countryKeyA3) {
        // countryKeyA3 is expected to be A3 uppercase
        let pos = this.convertCoords(lat, lon);
        // Ensure we have an uppercase A3 code for the unit
        let unitCountryA3Upper = countryKeyA3 !== undefined
            ? String(countryKeyA3).toUpperCase() // Ensure string and uppercase
            : this.playerCountryA3; // Use the stored player country A3

        // Find the corresponding A2 lowercase code for the flag URL using the helper
        let countryCodeA2Lower = this.getA2CodeFromA3(unitCountryA3Upper);


        let flagURL = countryCodeA2Lower
            ? `https://flagcdn.com/w40/${countryCodeA2Lower}.png`
            : ""; // Use A2 lowercase for flag URL
        let key = "flag_" + unitCountryA3Upper; // Use A3 uppercase for texture key

        if (!this.textures.exists(key) && flagURL) {
            // Only try to load if we have a URL
            let img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                this.textures.addImage(key, img);
                this.createTroopSprite(pos, troopCount, key, unitCountryA3Upper); // Pass A3 uppercase
                this.updateTerrainColor(
                    { x: pos.x, y: pos.y }, // Use pos directly, it's already world coordinates
                    this.countryColors[unitCountryA3Upper] || "#FFFFFF", // Look up color by A3 uppercase
                    unitCountryA3Upper // Pass A3 uppercase
                );
            };
            img.onerror = () => {
                 console.warn(`Failed to load flag image for ${unitCountryA3Upper} (${flagURL}). Using placeholder or no image.`);
                 this.createTroopSprite(pos, troopCount, null, unitCountryA3Upper); // Pass null key for placeholder, A3 uppercase for country
                 // Note: updateTerrainColor here might be trying to color an ocean tile if the initial position isn't on land.
                 // This might be expected or require additional checks depending on game design.
                 this.updateTerrainColor(
                     { x: pos.x, y: pos.y }, // Use pos directly
                     this.countryColors[unitCountryA3Upper] || "#FFFFFF",
                     unitCountryA3Upper
                 );
            };
            img.src = flagURL;
        } else {
            // If texture exists or no flagURL
            this.createTroopSprite(
                pos,
                troopCount,
                this.textures.exists(key) ? key : null,
                unitCountryA3Upper // Pass A3 uppercase
            );
            this.updateTerrainColor(
                { x: pos.x, y: pos.y }, // Use pos directly
                this.countryColors[unitCountryA3Upper] || "#FFFFFF", // Look up color by A3 uppercase
                unitCountryA3Upper // Pass A3 uppercase
            );
        }
    }


    createTroopSprite(pos, troopCount, textureKey, countryA3) {
        // countryA3 is expected to be A3 uppercase
        let sprite;
        if (textureKey && this.textures.exists(textureKey)) {
            sprite = this.add.sprite(0, 0, textureKey);
            sprite.setScale(0.5);
        } else {
            // Create a placeholder or a simple shape if no flag image
            sprite = this.add.circle(0, 0, 15, 0x808080); // Grey circle placeholder
        }

        let label = this.add.text(0, -20, `${troopCount} troops`, {
            font: "14px Arial",
            fill: "#ffffff",
        });
        label.setOrigin(0.5); // Center the label
        label.setVisible(false);
        let container = this.add.container(pos.x, pos.y, [sprite, label]);
        // Adjust size based on the sprite/placeholder used
        if (sprite instanceof Phaser.GameObjects.Sprite) {
            container.setSize(sprite.displayWidth, sprite.displayHeight);
            // Set interactive area based on sprite bounds
            container.setInteractive(
                new Phaser.Geom.Rectangle(
                    -sprite.displayWidth / 2,
                    -sprite.displayHeight / 2,
                    sprite.displayWidth,
                    sprite.displayHeight
                ),
                Phaser.Geom.Rectangle.Contains
            );
        } else if (sprite instanceof Phaser.GameObjects.Shape) {
            // For placeholder circle
            container.setSize(sprite.radius * 2, sprite.radius * 2);
            // Set interactive area based on circle bounds
            container.setInteractive(
                new Phaser.Geom.Circle(0, 0, sprite.radius),
                Phaser.Geom.Circle.Contains
            );
        }

        container.country = String(countryA3).toUpperCase(); // Store A3 uppercase code, ensure string
        container.troopCount = troopCount;
        container.on("pointerover", () => label.setVisible(true));
        container.on("pointerout", () => label.setVisible(false));

        // Individual selection: tint when clicked.
        container.on("pointerdown", (pointer, localX, localY, event) => {
            event.stopPropagation(); // Important: Prevent the global pointerdown from firing
            // Prevent selection in any active mode (global, area select, area capture)
            if (this.globalSelectionActive || this.areaSelectionActive || this.areaCaptureActive) return;
            // Use the stored playerCountryA3
            let selectedCountryA3 = this.playerCountryA3;
            if (container.country !== selectedCountryA3) return; // Only select player's own units

            // Clear previous individual selection tint if any
            if (this.selectedUnit) {
                let prevSprite = this.selectedUnit.list[0];
                // Clear tint only if it's a sprite (not the placeholder circle)
                if (prevSprite instanceof Phaser.GameObjects.Sprite) {
                    prevSprite.clearTint();
                }
            }
            // Set new selected unit
            this.selectedUnit = container;
            let currentSprite = container.list[0];
            // Apply tint only if it's a sprite
            if (currentSprite instanceof Phaser.GameObjects.Sprite) {
                currentSprite.setTint(0x00ff00); // Tint the newly selected unit
            }
        });
        this.troopGroup.add(container); // Adds the container to the troopGroup

        // Add supply line indicator
        const supplyIndicator = this.add.circle(0, 15, 3, 0x00ff00)
            .setAlpha(0)
            .setDepth(1);
        container.add(supplyIndicator); // Adds the indicator to the container

        // Update supply indicator on pointerover
        container.on('pointerover', () => {
            label.setVisible(true);
            const effectiveness = this.checkSupplyLines(
                container,
                Math.floor((container.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize),
                Math.floor((container.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize)
            );
            supplyIndicator.setFillStyle(
                effectiveness > 0.7 ? 0x00ff00 :
                effectiveness > 0.3 ? 0xffff00 : 0xff0000
            );
            supplyIndicator.setAlpha(0.8);
        }); // Added semicolon

        container.on('pointerout', () => {
            label.setVisible(false);
            supplyIndicator.setAlpha(0);
        }); // Added semicolon


         return container; // Return the created container for easier management
    }


    combineUnits() {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // Only allow combine if global selection is active and at least 2 units from the player's country are selected
        if (this.globalSelectionActive) {
            let unitsToCombine = this.selectedUnits.filter(
                (unit) => unit.country === selectedCountryA3 // Filter by A3 uppercase
            );

            if (unitsToCombine.length < 2) {
                console.warn("Combine conditions not met: Global selection active, but less than 2 units from your country selected.");
                return;
            }

            let totalTroops = 0;
            // Find the "most senior" unit (e.g., the first one selected or just the first in the filtered list) to be the master unit.
            // This prevents issues if the user happened to also select enemy units globally (which shouldn't happen with the filter).
            let masterUnit = unitsToCombine[0];


            unitsToCombine.forEach((unit, index) => {
                totalTroops += unit.troopCount;
                if (unit !== masterUnit) { // Destroy units other than the master
                    // Remove unit from auto-capturing list if it was in it and stop its tween
                     if (this.unitsAutoCapturing.has(unit)) {
                          this.unitsAutoCapturing.delete(unit);
                           if (unit.tween) {
                               unit.tween.stop();
                               delete unit.tween;
                           }
                            delete unit.targetCell; // Clear the assigned target cell
                     }
                    unit.destroy();
                }
            });

            masterUnit.troopCount = totalTroops;
            masterUnit.list[1].setText(`${totalTroops} troops`);
            let sprite = masterUnit.list[0];
            // Apply tint only if it's a sprite
            if (sprite instanceof Phaser.GameObjects.Sprite) {
                sprite.setTint(0x00ff00);
            }
            this.selectedUnits = [masterUnit]; // Global selection now contains only the combined unit
             console.log(`Combined ${unitsToCombine.length} units into one with ${totalTroops} troops.`);
        } else {
             console.log("Combine conditions not met: Global selection not active.");
        }
    }


    splitUnit() {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // Determine the unit to split: prioritize individual selection, then the first unit in global selection (if active)
        let unitToSplit = null;
        if (this.selectedUnit && this.selectedUnit.country === selectedCountryA3) {
             unitToSplit = this.selectedUnit;
        } else if (this.globalSelectionActive && this.selectedUnits.length > 0) {
             unitToSplit = this.selectedUnits.find(
                 (u) => u.country === selectedCountryA3
             );
        }


        if (!unitToSplit || unitToSplit.troopCount < 20000) {
            console.log("Split conditions not met:", {
                unit: !!unitToSplit, // Indicate if a unit was found
                troopCount: unitToSplit ? unitToSplit.troopCount : "N/A",
            });
            console.warn("Cannot split unit: Requires at least 20000 troops and a unit from your country to be selected (individually or via global selection).");
            return;
        }

        let total = unitToSplit.troopCount;
        let first = Math.floor(total / 2 / 10000) * 10000; // Split into roughly half, in 10000 increments
        let second = total - first;
        if (first < 10000 || second < 10000) {
            console.log("Split results in units less than 10000:", {
                first: first,
                second: second,
            });
            console.warn("Cannot split unit: Resulting units would be less than the minimum troop count (10000).");
            return;
        }

         // Stop any ongoing auto-capture for the unit being split
         if (this.unitsAutoCapturing.has(unitToSplit)) {
              this.unitsAutoCapturing.delete(unitToSplit);
               if (unitToSplit.tween) {
                   unit.tween.stop();
                   delete unit.tween;
               }
                delete unitToSplit.targetCell; // Clear the assigned target cell
         }


        // Update the original unit's troop count
        unitToSplit.troopCount = first;
        unitToSplit.list[1].setText(`${first} troops`);

        // Create the new unit
        let offset = 30; // Increased offset to prevent immediate overlap
        // Corrected: Use offsetY for the y coordinate offset
        let newPos = { x: unitToSplit.x + offsetX, y: unitToSplit.y + offsetY };
        let countryA3 = unitToSplit.country; // Get the A3 uppercase code

        // Find the corresponding A2 lowercase code for the flag texture key using the helper
        let countryCodeA2Lower = this.getA2CodeFromA3(countryA3);
        let key = countryCodeA2Lower ?
            "flag_" + countryA3 : null; // Use A3 uppercase for key, ensure A2 exists for potential loading

         // Create the new troop sprite
         let newUnit = this.createTroopSprite(
             newPos,
             second,
             this.textures.exists(key) ? key : null, // Use existing key or null for placeholder
             countryA3 // Pass A3 uppercase
         );


        // If global selection is active, add the new unit to the selected units list and tint it
        if (this.globalSelectionActive) {
            let sprite = newUnit.list[0];
            if (sprite instanceof Phaser.GameObjects.Sprite) {
                sprite.setTint(0x00ff00);
            }
            this.selectedUnits.push(newUnit);
        }
        console.log(`Split unit into two: ${first} troops and ${second} troops.`);
    }


    toggleGlobalSelection() {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        if (!this.globalSelectionActive) {
             // Ensure no other area selection mode is active before activating global selection
             if (this.areaSelectionActive) {
                 this.areaSelectionActive = false;
                 this.selectionStart = null;
                 this.selectionEnd = null;
                 this.selectionGraphics.clear();
                 console.log("Area selection mode canceled because Global Selection was activated.");
             }
              if (this.areaCaptureActive) {
                   this.areaCaptureActive = false;
                   this.captureSelectionStart = null;
                   this.captureSelectionEnd = null;
                   this.selectionGraphics.clear();
                   console.log("Area capture mode canceled because Global Selection was activated.");
              }


            this.globalSelectionActive = true;
            this.selectedUnits = [];
             // Clear any ongoing auto-capture targets and units when global selection is activated
             this.autoCaptureTargets = [];
             this.unitsAutoCapturing.forEach(unit => {
                  if (unit.tween) {
                      unit.tween.stop();
                      delete unit.tween;
                  }
                   delete unit.targetCell; // Clear the assigned target cell
             });
             this.unitsAutoCapturing.clear();


            this.troopGroup.getChildren().forEach((unit) => {
                 if (unit.country === selectedCountryA3) { // Compare with A3 uppercase
                    this.selectedUnits.push(unit);
                    let sprite = unit.list[0]; // Get the sprite inside the container.
                    if (sprite instanceof Phaser.GameObjects.Sprite) {
                        // Only tint sprites
                        sprite.setTint(0x00ff00);
                    }
                } else {
                    // Clear tint from units not belonging to the selected country (if any were tinted)
                    let sprite = unit.list[0];
                    if (sprite instanceof Phaser.GameObjects.Sprite) {
                        sprite.clearTint();
                    }
                }
            });
            // If no units from the selected country, still activate global selection but selectedUnits will be empty
            if (this.selectedUnits.length === 0) {
                console.warn(
                    `No troops found for your selected country (${selectedCountryA3}). Global selection active but empty.`
                );
            } else {
                 console.log(`Global selection active for ${selectedCountryA3}. ${this.selectedUnits.length} units selected.`);
            }
        } else {
            this.globalSelectionActive = false;
             // Clear any ongoing auto-capture targets and units when global selection is deactivated
             this.autoCaptureTargets = [];
             this.unitsAutoCapturing.forEach(unit => {
                  if (unit.tween) {
                      unit.tween.stop();
                      delete unit.tween;
                  }
                   delete unit.targetCell; // Clear the assigned target cell
             });
             this.unitsAutoCapturing.clear();

            this.selectedUnits.forEach((unit) => {
                let sprite = unit.list[0];
                if (sprite instanceof Phaser.GameObjects.Sprite) {
                    // Only clear tint from sprites
                    sprite.clearTint();
                }
            });
            this.selectedUnits = [];
            console.log(`Global selection deactivated for ${selectedCountryA3}.`);
        }
    }


    // --- Area Selection Functions (Y key) ---
    toggleAreaSelection() {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // If area selection is active:
        if (this.areaSelectionActive) {
            // If no start point was set, cancel the mode.
            if (!this.selectionStart) {
                this.areaSelectionActive = false;
                this.selectionGraphics.clear();
                console.log("Area selection canceled (Y key).");
                // Restore previous tinting if global selection was active
                if (this.globalSelectionActive) {
                     this.selectedUnits.forEach(unit => {
                         if (unit.country === selectedCountryA3) {
                             let sprite = unit.list[0];
                             if (sprite instanceof Phaser.GameObjects.Sprite) {
                                 sprite.setTint(0x00ff00);
                             }
                         }
                     });
                }
                return; //
            } else {
                // Otherwise, set the end point and finalize.
                this.finalizeAreaSelection();
            }
        } else {
             // Ensure no other area selection mode is active
             if (this.areaCaptureActive) {
                  this.areaCaptureActive = false;
                  this.captureSelectionStart = null;
                  this.captureSelectionEnd = null;
                  this.selectionGraphics.clear();
                  console.log("Area capture mode canceled because Area Selection (Y key) was activated.");
             }
              // Ensure global selection is active
              if (!this.globalSelectionActive) {
                   console.warn("Global selection not active! Cannot use Area Selection (Y key).");
                   alert("Please activate global selection (U key) before using Area Selection (Y key).");
                   return;
              }

            // Only allow area selection mode if troops from the *selected* country are already selected globally.
            const selectedOwnedUnits = this.selectedUnits.filter(
                (unit) => unit.country === selectedCountryA3 // Filter by A3 uppercase
            );
            if (!selectedOwnedUnits || selectedOwnedUnits.length === 0) {
                console.warn(
                    `No troops from your selected country (${selectedCountryA3}) selected! Select your troops first before activating area selection (Y key).`
                );
                alert("Please activate global selection (U key) and ensure you have troops selected to use area selection (Y key).");
                return;
            }
            // Disable tint on globally selected units while in area selection mode
            this.selectedUnits.forEach(unit => {
                 let sprite = unit.list[0];
                 if (sprite instanceof Phaser.GameObjects.Sprite) {
                     sprite.clearTint();
                 }
            });

            // Enable area selection mode.
            this.areaSelectionActive = true;
            this.selectionStart = null;
            this.selectionEnd = null;
            this.selectionGraphics.clear();
            this.selectionGraphics.lineStyle(2, 0x00ff00, 1); // Green border for Y key
            this.selectionGraphics.fillStyle(0x00ff00, 0.3); // Semi-transparent green fill for Y key
            console.log(
                "Area selection mode enabled (Y key). Click once to set start point."
            );
        }
    }

    onPointerDownForAreaSelection(pointer) {
        // If no start point has been set, use this click as the start.
        if (!this.selectionStart) {
            this.selectionStart = { x: pointer.worldX, y: pointer.worldY };
            console.log("Selection start set (Y key):", this.selectionStart);
        } else {
            // Otherwise, set the end point and finalize.
            this.selectionEnd = { x: pointer.worldX, y: pointer.worldY };
            console.log("Selection end set (Y key):", this.selectionEnd);
            this.finalizeAreaSelection();
        }
    }

    onPointerMoveForAreaSelection(pointer) {
        if (!this.areaSelectionActive || !this.selectionStart) return;
        this.selectionEnd = { x: pointer.worldX, y: pointer.worldY };
        this.selectionGraphics.clear();
        this.selectionGraphics.lineStyle(2, 0x00ff00, 1); // Green border
        this.selectionGraphics.fillStyle(0x00ff00, 0.3); // Semi-transparent green fill
        this.selectionGraphics.fillRect(
            Math.min(this.selectionStart.x, this.selectionEnd.x),
            Math.min(this.selectionStart.y, this.selectionEnd.y),
            Math.abs(this.selectionEnd.x - this.selectionStart.x),
            Math.abs(this.selectionEnd.y - this.selectionStart.y)
        );
         this.selectionGraphics.strokeRect( // Draw the border
            Math.min(this.selectionStart.x, this.selectionEnd.x),
            Math.min(this.selectionStart.y, this.selectionEnd.y),
            Math.abs(this.selectionEnd.x - this.selectionStart.x),
            Math.abs(this.selectionEnd.y - this.selectionStart.y)
         );
    }

    finalizeAreaSelection() {
        if (!this.selectionStart || !this.selectionEnd) {
            console.warn(
                "Incomplete area selection (Y key). Please define both start and end points."
            );
            // Reset area selection mode and restore tinting
            this.areaSelectionActive = false;
            this.selectionStart = null;
            this.selectionEnd = null;
            this.selectionGraphics.clear();
            if (this.globalSelectionActive) {
                let selectedCountryA3 = this.playerCountryA3;
                this.selectedUnits.forEach(unit => {
                    if (unit.country === selectedCountryA3) {
                        let sprite = unit.list[0];
                        if (sprite instanceof Phaser.GameObjects.Sprite) {
                            sprite.setTint(0x00ff00);
                        }
                    }
                });
            }
            return;
        }
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        const selectedOwnedUnits = this.selectedUnits.filter(
            (unit) => unit.country === selectedCountryA3 // Filter by A3 uppercase
        );

        let minX = Math.min(this.selectionStart.x, this.selectionEnd.x);
        let maxX = Math.max(this.selectionStart.x, this.selectionEnd.x);
        let minY = Math.min(this.selectionStart.y, this.selectionEnd.y);
        let maxY = Math.max(this.selectionStart.y, this.selectionEnd.y);

        const fixedSpeed = 50; // pixels per second

        selectedOwnedUnits.forEach((unit) => {
            // Only move units belonging to the player's country (A3 uppercase)
            // Choose a random destination within the defined rectangle.
            let randomX = Phaser.Math.Between(minX, maxX);
            let randomY = Phaser.Math.Between(minY, maxY);

            // Calculate the distance from the current position to the destination.
            let distance = Phaser.Math.Distance.Between(
                unit.x,
                unit.y,
                randomX,
                randomY
            );

            // Compute duration (in ms) so that speed = distance/time = 50 pixels per second.
            let duration = (distance / fixedSpeed) * 1000;

            this.tweens.add({
                targets: unit,
                x: randomX,
                y: randomY,
                duration: duration,
                ease: "Linear",
                onComplete: () => {
                    this.updateTerrainColor(
                        { x: unit.x, y: unit.y },
                         this.countryColors[unit.country] || "#FFFFFF", // unit.country is A3 uppercase
                         unit.country // Pass A3 uppercase
                    );
                },
            });
        });
        console.log("Selected troops spread out in the selected area (Y key).");

        // Reset area selection mode and restore tinting
        this.areaSelectionActive = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selectionGraphics.clear();
         if (this.globalSelectionActive) {
             let selectedCountryA3 = this.playerCountryA3;
             this.selectedUnits.forEach(unit => {
                 if (unit.country === selectedCountryA3) {
                     let sprite = unit.list[0];
                     if (sprite instanceof Phaser.GameObjects.Sprite) {
                         sprite.setTint(0x00ff00);
                     }
                 }
             });
         }
    }
    // --- End of Area Selection Functions ---

    // --- Auto-Capture Country Function (R key) ---
    handleAutoCaptureCountry() {
        console.log("R key pressed: Initiating Auto-Capture Country.");
        // Ensure global selection is active and there are units selected for the player's country
        let selectedCountryA3 = this.playerCountryA3;
        const selectedOwnedUnits = this.selectedUnits.filter(
            (unit) => unit.country === selectedCountryA3 // Filter by A3 uppercase
        );

        if (!this.globalSelectionActive || selectedOwnedUnits.length === 0) {
            console.warn("Global selection not active or no troops selected for your country. Cannot auto-capture country.");
            alert("Please activate global selection (U key) and ensure you have troops selected to auto-capture a country.");
            return;
        }

         // Stop any ongoing auto-capture for these units before assigning new country targets
         selectedOwnedUnits.forEach(unit => {
              if (this.unitsAutoCapturing.has(unit)) {
                  this.unitsAutoCapturing.delete(unit);
                   if (unit.tween) {
                       unit.tween.stop();
                       delete unit.tween;
                   }
                    delete unit.targetCell; // Clear the assigned target cell
              }
         });


        // Prompt the user for the target country's A3 code
        let targetCountryA3 = prompt("Enter the A3 code of the country to auto-capture:");
        if (!targetCountryA3) {
            console.log("Auto-capture country canceled by user.");
            return; // User canceled the prompt
        }
        targetCountryA3 = targetCountryA3.toUpperCase(); // Ensure uppercase

        // Validate the target country code (basic check: must be 3 letters)
        if (targetCountryA3.length !== 3) {
            console.warn(`Invalid A3 country code entered: ${targetCountryA3}. Must be 3 letters.`);
            alert("Invalid A3 country code. Please enter a 3-letter code.");
            return;
        }

        console.log(`Auto-capturing country with A3 code: ${targetCountryA3}`);

        // Find all grid cells belonging to the target country that are NOT currently owned by the player
        const targetCells = [];
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                // Only consider land tiles that are *not* already owned by the player and belong to the target country
                if (this.territoryGrid[y] && this.territoryGrid[y][x] === targetCountryA3) {
                     targetCells.push({ x, y });
                }
            }
        }

        if (targetCells.length === 0) {
            console.warn(`No capturable territory found for country code ${targetCountryA3}. Cannot auto-capture.`);
            alert(`No capturable territory found for the country code: ${targetCountryA3}. Cannot auto-capture.`);
            return;
        }

         // Set the general auto-capture targets list for this operation
         this.autoCaptureTargets = targetCells.slice(); // Copy the array


        // --- Simplified troop movement for auto-capture (Country) ---
        // Distribute troops among target cells.
        const numUnits = selectedOwnedUnits.length;
        const numTargetCells = this.autoCaptureTargets.length;
        const fixedSpeed = 50; // pixels per second

        selectedOwnedUnits.forEach((unit) => {
            // Add the unit to the set of auto-capturing units
             this.unitsAutoCapturing.add(unit);

            // Assign the first available target cell from the shared list
            this.assignNextCaptureTarget(unit, this.autoCaptureTargets);

        });

        console.log(`Directed ${this.unitsAutoCapturing.size} units to begin capturing cells in country ${targetCountryA3}. Total capturable cells: ${numTargetCells}.`);
        // Note: The actual capturing of tiles will be handled by the periodic updateTerritoryControl based on troop presence.
    }

    // --- Area Capture Selection Functions (E key) ---
    toggleAreaCaptureSelection() {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // If area capture is active:
        if (this.areaCaptureActive) {
            // If no start point was set, cancel the mode.
            if (!this.captureSelectionStart) {
                this.areaCaptureActive = false;
                this.selectionGraphics.clear(); // Clear the shared graphics
                console.log("Area capture selection canceled (E key).");
                // Restore previous tinting if global selection was active
                if (this.globalSelectionActive) {
                     this.selectedUnits.forEach(unit => {
                         if (unit.country === selectedCountryA3) {
                             let sprite = unit.list[0];
                             if (sprite instanceof Phaser.GameObjects.Sprite) {
                                 sprite.setTint(0x00ff00);
                             }
                         }
                     });
                }
                return;
            } else {
                // Otherwise, set the end point and finalize.
                this.finalizeAreaCaptureSelection(); // NEW finalize function for capture
            }
        } else {
            // Ensure no other area selection mode is active
             if (this.areaSelectionActive) {
                  this.areaSelectionActive = false;
                  this.selectionStart = null;
                  this.selectionEnd = null;
                  this.selectionGraphics.clear();
                  console.log("Area selection mode canceled because Area Capture (E key) was activated.");
             }
              // Ensure global selection is active
              if (!this.globalSelectionActive) {
                   console.warn("Global selection not active! Cannot use Area Capture (E key).");
                   alert("Please activate global selection (U key) before using Area Capture (E key).");
                   return;
              }

            // Only allow area capture mode if troops from the *selected* country are already selected globally.
            const selectedOwnedUnits = this.selectedUnits.filter(
                (unit) => unit.country === selectedCountryA3 // Filter by A3 uppercase
            );
            if (!selectedOwnedUnits || selectedOwnedUnits.length === 0) {
                console.warn(
                    `Global selection not active or no troops from your selected country (${selectedCountryA3}) selected! Activate global selection (U key) and select troops first before activating area capture (E key).`
                );
                 alert("Please activate global selection (U key) and ensure you have troops selected to auto-capture an area.");
                return;
            }

            // Disable tint on globally selected units while in area selection mode
            this.selectedUnits.forEach(unit => {
                 let sprite = unit.list[0];
                 if (sprite instanceof Phaser.GameObjects.Sprite) {
                     sprite.clearTint();
                 }
            });

             // Stop any ongoing auto-capture for these units before assigning new area targets
             selectedOwnedUnits.forEach(unit => {
                 if (this.unitsAutoCapturing.has(unit)) {
                     this.unitsAutoCapturing.delete(unit);
                     if (unit.tween) {
                         unit.tween.stop();
                         delete unit.tween;
                     }
                      delete unit.targetCell; // Clear the assigned target cell
                 }
             });


            // Enable area capture mode.
            this.areaCaptureActive = true;
            this.captureSelectionStart = null;
            this.captureSelectionEnd = null;
            this.selectionGraphics.clear(); // Clear graphics from other modes
            this.selectionGraphics.lineStyle(2, 0xffa500, 1); // Orange border for E key
            this.selectionGraphics.fillStyle(0xffa500, 0.3); // Semi-transparent orange fill for E key
            // The selectionGraphics is already cleared above and will be used in onPointerMoveForAreaCapture
            console.log(
                "Area capture mode enabled (E key). Click once to set start point."
            );
        }
    }

    onPointerDownForAreaCapture(pointer) {
        // If no start point has been set, use this click as the start.
        if (!this.captureSelectionStart) {
            this.captureSelectionStart = { x: pointer.worldX, y: pointer.worldY };
            console.log("Capture selection start set (E key):", this.captureSelectionStart);
        } else {
            // Otherwise, set the end point and finalize.
            this.captureSelectionEnd = { x: pointer.worldX, y: pointer.worldY };
            console.log("Capture selection end set (E key):", this.captureSelectionEnd);
            this.finalizeAreaCaptureSelection(); // NEW finalize function
        }
    }

    onPointerMoveForAreaCapture(pointer) {
        if (!this.areaCaptureActive || !this.captureSelectionStart) return;
        this.captureSelectionEnd = { x: pointer.worldX, y: pointer.worldY };
        this.selectionGraphics.clear(); // Use the shared graphics
        this.selectionGraphics.lineStyle(2, 0xffa500, 1); // Orange border for capture area
        this.selectionGraphics.fillStyle(0xffa500, 0.3); // Semi-transparent orange fill
        this.selectionGraphics.fillRect(
            Math.min(this.captureSelectionStart.x, this.captureSelectionEnd.x),
            Math.min(this.captureSelectionStart.y, this.captureSelectionEnd.y),
            Math.abs(this.captureSelectionEnd.x - this.captureSelectionStart.x),
            Math.abs(this.captureSelectionEnd.y - this.captureSelectionStart.y)
        );
         this.selectionGraphics.strokeRect( // Draw the border
            Math.min(this.captureSelectionStart.x, this.captureSelectionEnd.x),
            Math.min(this.captureSelectionStart.y, this.captureSelectionEnd.y),
            Math.abs(this.captureSelectionEnd.x - this.captureSelectionStart.x),
            Math.abs(this.captureSelectionEnd.y - this.captureSelectionStart.y)
         );
    }

    finalizeAreaCaptureSelection() {
        if (!this.captureSelectionStart || !this.captureSelectionEnd) {
            console.warn(
                "Incomplete area capture selection (E key). Please define both start and end points."
            );
            // Reset area capture mode and restore tinting
            this.areaCaptureActive = false;
            this.captureSelectionStart = null;
            this.captureSelectionEnd = null;
            this.selectionGraphics.clear();
            if (this.globalSelectionActive) {
                let selectedCountryA3 = this.playerCountryA3;
                this.selectedUnits.forEach(unit => {
                    if (unit.country === selectedCountryA3) {
                        let sprite = unit.list[0];
                        if (sprite instanceof Phaser.GameObjects.Sprite) {
                            sprite.setTint(0x00ff00);
                        }
                    }
                });
            }
            return;
        }

        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        const selectedOwnedUnits = this.selectedUnits.filter(
            (unit) => unit.country === selectedCountryA3 // Filter by A3 uppercase
        );

        let minX = Math.min(this.captureSelectionStart.x, this.captureSelectionEnd.x);
        let maxX = Math.max(this.selectionStart.x, this.selectionEnd.x);
        let minY = Math.min(this.captureSelectionStart.y, this.captureSelectionEnd.y);
        let maxY = Math.max(this.selectionStart.y, this.selectionEnd.y);

        // Convert world coordinates to grid coordinates for the selected area
        const worldMapWidth = 360 * this.scaleFactor;
        const worldMapHeight = 170.1 * this.scaleFactor;
        const textureOriginX = this.offsetX - worldMapWidth / 2;
        const textureOriginY = this.offsetY - worldMapHeight / 2;

        const minGridX = Math.max(0, Math.floor((minX - textureOriginX) / this.gridSize));
        const maxGridX = Math.min(this.gridWidth - 1, Math.floor((maxX - textureOriginX) / this.gridSize));
        const minGridY = Math.max(0, Math.floor((minY - textureOriginY) / this.gridSize)); // Corrected typo: myY to minY
        const maxGridY = Math.min(this.gridHeight - 1, Math.floor((maxY - textureOriginY) / this.gridSize));

        // Find all capturable grid cells within the selected area
        const targetCells = [];
        for (let y = minGridY; y <= maxGridY; y++) {
            for (let x = minGridX; x <= maxGridX; x++) {
                 // Only consider land tiles that are *not* already owned by the player and are within grid bounds
                 if (this.territoryGrid[y] && this.territoryGrid[y][x] && this.territoryGrid[y][x] !== selectedCountryA3) {
                     targetCells.push({ x, y });
                 }
            }
        }

        if (targetCells.length === 0) {
             console.warn(`No capturable territory found within the selected area. Cannot auto-capture.`);
             alert("No capturable territory found within the selected area.");
             // Reset area capture mode and restore tinting
             this.areaCaptureActive = false;
             this.captureSelectionStart = null;
             this.captureSelectionEnd = null;
             this.selectionGraphics.clear();
             if (this.globalSelectionActive) {
                  let selectedCountryA3 = this.playerCountryA3;
                  this.selectedUnits.forEach(unit => {
                      if (unit.country === selectedCountryA3) {
                          let sprite = unit.list[0];
                          if (sprite instanceof Phaser.GameObjects.Sprite) {
                              sprite.setTint(0x00ff00);
                          }
                      }
                  });
             }
             return;
        }

        // Set the general auto-capture targets list for this operation
         this.autoCaptureTargets = targetCells.slice(); // Copy the array


        // --- Simplified troop movement for area capture (Area) ---
        // Distribute selected troops among the target cells.
        const numUnits = selectedOwnedUnits.length;
        const numTargetCells = this.autoCaptureTargets.length;
        const fixedSpeed = 50; // pixels per second

        selectedOwnedUnits.forEach((unit) => {
             // Add the unit to the set of auto-capturing units
             this.unitsAutoCapturing.add(unit);

             // Assign the first available target cell from the shared list
            this.assignNextCaptureTarget(unit, this.autoCaptureTargets);

        });

        console.log(`Directed ${this.unitsAutoCapturing.size} selected units to begin capturing ${numTargetCells} cells within the selected area.`);

        // Reset area capture mode and restore tinting
        this.areaCaptureActive = false;
        this.captureSelectionStart = null;
        this.captureSelectionEnd = null;
        this.selectionGraphics.clear();
         if (this.globalSelectionActive) {
             let selectedCountryA3 = this.playerCountryA3;
             this.selectedUnits.forEach(unit => {
                 if (unit.country === selectedCountryA3) {
                     let sprite = unit.list[0];
                     if (sprite instanceof Phaser.GameObjects.Sprite) {
                         sprite.setTint(0x00ff00);
                     }
                 }
             });
         }
    }

    // --- Helper for Auto-Capture: Find the nearest unoccupied target cell ---
    findNearestUnoccupiedTarget(unit, targetCells) {
        // targetCells is now expected to be this.autoCaptureTargets
        let nearestTarget = null;
        let minDistance = Infinity;
        let nearestTargetIndex = -1; // Store the index to remove it later

        const unitGridX = Math.floor((unit.x - (this.offsetX - 180 * this.scaleFactor)) / this.gridSize);
        const unitGridY = Math.floor((unit.y - (this.offsetY - 85 * this.scaleFactor)) / this.gridSize);


        for (let i = 0; i < targetCells.length; i++) {
            const cell = targetCells[i];
            // Check if another auto-capturing unit is already heading to this exact target cell
             let isTargetOccupiedByOtherUnit = false;
             // Iterate through other auto-capturing units
             for (const otherUnit of this.unitsAutoCapturing) {
                 // Check if the other unit has a targetCell assigned and it's the same as the current cell
                 if (otherUnit !== unit && otherUnit.targetCell && otherUnit.targetCell.x === cell.x && otherUnit.targetCell.y === cell.y) {
                      isTargetOccupiedByOtherUnit = true;
                      break; // Found another unit targeting this cell
                 }
             }

             if (isTargetOccupiedByOtherUnit) {
                  continue; // Skip if another unit is targeting this cell
             }


            const distance = Math.sqrt(
                Math.pow(cell.x - unitGridX, 2) + Math.pow(cell.y - unitGridY, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestTarget = cell;
                nearestTargetIndex = i; // Store the index
            }
        }

        // Return the found target cell {x, y} and its index in the array
        return { target: nearestTarget, index: nearestTargetIndex };
    }

    // --- Helper for Auto-Capture: Assign the next target after arrival ---
    assignNextCaptureTarget(unit, targetList) { // Now uses targetList argument which should be this.autoCaptureTargets
        // Check if the unit is still in the set of auto-capturing units
         if (!this.unitsAutoCapturing.has(unit)) {
              console.log(`Unit finished auto-capturing due to external action.`);
              // Clear the unit's target and tween references if it stopped auto-capturing externally
              delete unit.targetCell;
               if (unit.tween) {
                   unit.tween.stop();
                   delete unit.tween;
               }
              return; // Stop if the unit is no longer auto-capturing
         }

         // Clear the unit's current target cell before finding a new one
         delete unit.targetCell;


        // Find the nearest uncaptured land tile within the current target list
         const result = this.findNearestUnoccupiedTarget(unit, targetList); // Pass the current targetList
         const nextTarget = result.target;
         const targetIndex = result.index;


        if (nextTarget) {
            const targetWorldPoint = {
                 x: nextTarget.x * this.gridSize + (this.offsetX - 180 * this.scaleFactor) + this.gridSize / 2,
                 y: nextTarget.y * this.gridSize + (this.offsetY - 85 * this.scaleFactor) + this.gridSize / 2
            };

             const fixedSpeed = 50; // pixels per second
             let distance = Phaser.Math.Distance.Between(
                 unit.x,
                 unit.y,
                 targetWorldPoint.x,
                 targetWorldPoint.y
             );
             let duration = (distance / fixedSpeed) * 1000;

             // Assign the new target cell to the unit
             unit.targetCell = nextTarget;

             // --- NEW: Remove the assigned target from the shared list ---
             if (targetIndex !== -1) {
                 targetList.splice(targetIndex, 1); // Remove the assigned target from the list
                 console.log(`DEBUG AUTO-CAPTURE: Assigned tile [${nextTarget.x},${nextTarget.y}] to unit and removed from target list.`);
             }
             // --- END NEW ---


            // Start a new tween to the next target
            unit.tween = this.tweens.add({ // Store the tween reference on the unit
                targets: unit,
                x: targetWorldPoint.x,
                y: targetWorldPoint.y,
                duration: duration,
                ease: "Linear",
                onComplete: () => {
                     // Small delay before finding the next target to allow grid update
                     // Pass the updated this.autoCaptureTargets to the next call
                     this.time.delayedCall(100, this.assignNextCaptureTarget, [unit, this.autoCaptureTargets], this);
                },
            });
             // console.log(`Unit reassigned to next target cell [${nextTarget.x},${nextTarget.y}].`); // Too verbose
        } else {
            console.log(`Unit finished auto-capturing. No more uncaptured targets found.`);
            // Remove unit from auto-capturing list when no more targets are found
             this.unitsAutoCapturing.delete(unit);
              // Clear the unit's target and tween references
             delete unit.targetCell;
              if (unit.tween) {
                  unit.tween.stop();
                  delete unit.tween;
              }
             // Optional: Add logic for the unit to garrison or return to base
        }
    }


    splitAllTroops() {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // Filter all troop units that belong to this country (A3 uppercase).
        let troopUnits = this.troopGroup
            .getChildren()
            .filter((unit) => unit.country === selectedCountryA3);

        // Find the corresponding A2 lowercase code for the flag texture key using the helper
        let countryCodeA2Lower = this.getA2CodeFromA3(selectedCountryA3);
        let textureKey = countryCodeA2Lower ?
            "flag_" + selectedCountryA3 : null; // Use A3 uppercase for key, ensure A2 exists for potential loading

        troopUnits.forEach((unit) => {
            // If troop count is above 10,000, then split it into groups of 10,000.
            if (unit.troopCount > 10000) {
                let groups = Math.floor(unit.troopCount / 10000); // Use floor to ensure whole groups
                if (groups > 1) {
                     // Stop any ongoing auto-capture for the unit being split
                     if (this.unitsAutoCapturing.has(unit)) {
                          this.unitsAutoCapturing.delete(unit);
                           if (unit.tween) {
                               unit.tween.stop();
                               delete unit.tween;
                           }
                            delete unit.targetCell; // Clear the assigned target cell
                     }


                    let originalTroopCount = unit.troopCount; // Store original count
                    // Set the original unit's troop count to 10000
                    unit.troopCount = 10000;
                    unit.list[1].setText(`10000 troops`);

                    let remainingTroops = originalTroopCount - 10000;

                    // Create new units with 10000 troops until remaining is less than 10000
                    while (remainingTroops >= 10000) {
                        // Calculate a small random offset so the new units aren’t exactly overlapping.
                        let offsetX = Phaser.Math.Between(-30, 30); // Increased offset
                        let offsetY = Phaser.Math.Between(-30, 30); // Increased offset
                        let newPos = {
                            x: unit.x + offsetX,
                            y: unit.y + offsetY,
                        };

                         // Create the new troop sprite
                         let newUnit = this.createTroopSprite(
                             newPos,
                             10000,
                             this.textures.exists(textureKey) ? textureKey : null, // Use existing key or null for placeholder
                             selectedCountryA3 // Pass A3 uppercase
                         );
                          // If global selection is active, add the new unit to the selected units list and tint it
                          if (this.globalSelectionActive) {
                               let sprite = newUnit.list[0];
                               if (sprite instanceof Phaser.GameObjects.Sprite) {
                                    sprite.setTint(0x00ff00);
                               }
                               this.selectedUnits.push(newUnit);
                          }

                        remainingTroops -= 10000;
                    }
                     // If there are remaining troops less than 10000, add them back to the original unit
                     unit.troopCount += remainingTroops;
                     unit.list[1].setText(`${Math.round(unit.troopCount)} troops`); // Update label with final count


                }
            }
        });
         if (troopUnits.length === 0) {
              console.log(`Split All Troops: No troops found for your country (${selectedCountryA3}).`);
         }
    }

    computeMilitary(countryCodeA2) {
        // countryCodeA2 is expected to be A2 lowercase for countryData lookup
        let total = 0;
        // Find the corresponding A3 uppercase code using the countryCodeMap from the A2 lowercase code
        let countryCodeA3Upper = this.countryCodeMap[String(countryCodeA2).toLowerCase()]; // Ensure string and lowercase


        if (countryCodeA3Upper) {
            this.troopGroup.getChildren().forEach((unit) => {
                 if (unit.country === countryCodeA3Upper) { // Compare unit.country (A3 uppercase) with found A3 uppercase
                    total += unit.troopCount;
                }
            });
        } else {
             // This warning is less critical, as not all A2 codes in countryData might map to an A3 in capitals.geojson
            // console.log( `computeMilitary: Could not find A3 code mapping in countryCodeMap for A2 code: ${countryCodeA2}. Cannot compute military size for this A2.`); // Too verbose
        }
        return total;
    }

     // Helper to get A3 uppercase from any input code (A3 or A2, case-insensitive) using the countryCodeMap
     getA3CodeFromAny(code) {
         if (code === null || code === undefined) return null; // Handle null/undefined localStorage values
         const codeStr = String(code); // Ensure code is treated as string
         const upperCode = codeStr.toUpperCase();
         const lowerCode = codeStr.toLowerCase();

         // 1. Check if the uppercase code is a key in the map
         if (this.countryCodeMap[upperCode]) {
             return this.countryCodeMap[upperCode]; // Returns the mapped A3 uppercase
         }
         // 2. Check if the lowercase code is a key in the map
         if (this.countryCodeMap[lowerCode]) {
              return this.countryCodeMap[lowerCode]; // Returns the mapped A3 uppercase
         }

         // 3. Fallback: If not found in map, assume it might be an A3 or A2 and try to map it to itself (uppercase)
         // This handles cases where a code exists in geojson/localStorage but not in capitals data.
         if (codeStr.length === 3 || codeStr.length === 2) {
              const fallbackA3 = upperCode; // Use the uppercase version as the fallback A3
              // We'll add this fallback mapping *only if* it's a 3-letter code, assuming it's a valid A3
              // This prevents mapping random 2-letter codes to themselves as A3s incorrectly.
              if (codeStr.length === 3) {
                  console.warn(`getA3CodeFromAny: Code "${code}" not found in countryCodeMap. Falling back to mapping "${fallbackA3}" to itself.`);
                  // We don't necessarily need to add this fallback to the map permanently here,
                  // just return the resolved A3 for the current use case.
              } else if (codeStr.length === 2) {
                 // If it's a 2-letter code not found in the map as a key, we can't reliably map it to an A3.
                 // It might correspond to an A3 that wasn't in the capitals data.
                 // We'll just return null, and the default 'USA' will be used.
                 // console.warn(`getA3CodeFromAny: 2-letter code "${code}" not found in countryCodeMap. Cannot resolve to A3.`); // Keep this warning for clarity
                 return null;
              }
              return fallbackA3; // Return the fallback A3 (only reached if length is 3 and not found in map)
         }


         console.warn(`getA3CodeFromAny: Could not resolve A3 uppercase for code: "${code}". Code length is not 2 or 3, and not found in map.`);
         return null; // Could not resolve for unexpected codes
     }

     // Helper to get A2 lowercase from A3 uppercase using the countryCodeMap
     getA2CodeFromA3(a3CodeUpper) {
         if (!a3CodeUpper) return null;
         const a3CodeUpperStr = String(a3CodeUpper).toUpperCase(); // Ensure string and uppercase

         // Iterate through the map to find the A2 lowercase key that maps TO this A3 uppercase value
         for (const key in this.countryCodeMap) {
             const keyStr = String(key);
             // Check if the value maps to the target A3, the key is 2 letters long, and the key is lowercase
             if (this.countryCodeMap[key] === a3CodeUpperStr && keyStr.length === 2 && keyStr === keyStr.toLowerCase()) {
                 return keyStr; // Found the A2 lowercase code (ensure string return)
             }
         }

         // console.warn(`getA2CodeFromA3: Could not resolve A2 lowercase for A3 uppercase: ${a3CodeUpper}.`); // Too verbose unless needed for debugging specific cases
         return null; // No A2 lowercase code found mapping to this A3
     }


    // --- UI Creation and Update Functions ---
    createUI() {
        let margin = 10;
        let gameWidth = this.sys.game.config.width;
        let gameHeight = this.sys.game.config.height;

        // --- Left Panel (Bottom Left): Country Flag and Name ---
        let leftPanelWidth = 180,
            leftPanelHeight = 80;
        let leftX = margin;
        let leftY = gameHeight - leftPanelHeight - margin;
        let leftBg = this.add
            .rectangle(leftX, leftY, leftPanelWidth, leftPanelHeight, 0x000000, 0.5)
            .setOrigin(0, 0)
            .setScrollFactor(0);

        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // Find the corresponding A2 lowercase code for countryData lookup and flag URL using the helper
        let selectedCountryA2Lower = this.getA2CodeFromA3(selectedCountryA3);

        // Ensure this.countryData is available before accessing it
        let countryData = selectedCountryA2Lower && this.countryData ?
            this.countryData[selectedCountryA2Lower] || {} : {};

        console.log(`DEBUG UI: Selected Country A3: ${selectedCountryA3}, Resolved A2: ${selectedCountryA2Lower}, Country Data:`, countryData); // Debug UI data


        let countryNameText = this.add
            .text(
                leftX + leftPanelWidth / 2,
                leftY + 5,
                countryData.name || selectedCountryA3, { // Use the A3 code if name is not found in data
                    font: "16px Arial",
                    fill: "#FFFFFF",
                }
            )
            .setOrigin(0.5) // Changed origin to 0.5 for horizontal and vertical center
            .setScrollFactor(0);
        let flagImg;
        // Use the A3 uppercase code for the texture key lookup
        if (this.textures.exists("flag_" + selectedCountryA3)) {
            flagImg = this.add
                .image(
                    leftX + leftPanelWidth / 2,
                    leftY + 40, // Adjusted Y position slightly
                    "flag_" + selectedCountryA3 // Use A3 uppercase for texture key
                )
                .setDisplaySize(40, 27)
                .setOrigin(0.5, 0)
                .setScrollFactor(0);
        } else {
            // Create a placeholder if the flag texture is not available (e.e. failed to load)
            flagImg = this.add
                .text(leftX + leftPanelWidth / 2, leftY + 40, selectedCountryA3, { // Display A3 code as placeholder text
                    font: "14px Arial",
                    fill: "#FFFFFF",
                })
                .setOrigin(0.5, 0)
                .setScrollFactor(0);
            console.warn(
                `Flag texture not found for ${selectedCountryA3} in createUI. Displaying A3 code as placeholder.`
            );
        }
        this.uiPanelLeft = this.add
            .container(0, 0, [leftBg, countryNameText, flagImg])
            .setScrollFactor(0);

        // --- Center Panel (Bottom Center): Economy and Military ---
        let centerPanelWidth = 200,
            centerPanelHeight = 80;
        let centerX = (gameWidth - centerPanelWidth) / 2;
        let centerY = gameHeight - centerPanelHeight - margin;
        let centerBg = this.add
            .rectangle(
                centerX,
                centerY,
                centerPanelWidth,
                centerPanelHeight,
                0x000000,
                0.5
            )
            .setOrigin(0, 0)
            .setScrollFactor(0);

        // For computeMilitary and UI text, we need the A2 lowercase code
        let military = selectedCountryA2Lower ?
            this.computeMilitary(selectedCountryA2Lower) :
            "N/A";
        let economy = countryData.economy || "N/A";

        this.uiTextCenter = this.add
            .text(
                centerX + centerPanelWidth / 2,
                centerY + centerPanelHeight / 2,
                `Economy: ${economy}\nMilitary: ${military}`, {
                    font: "16px Arial",
                    fill: "#FFFFFF",
                    align: "center",
                }
            )
            .setOrigin(0.5)
            .setScrollFactor(0);
        this.uiPanelCenter = this.add
            .container(0, 0, [centerBg, this.uiTextCenter])
            .setScrollFactor(0);

        // --- Right Panel (Bottom Right): Diplomacy Option ---
        let rightPanelWidth = 150,
            rightPanelHeight = 80;
        let rightX = gameWidth - rightPanelWidth - margin;
        let rightY = centerY;
        let rightBg = this.add
            .rectangle(
                rightX,
                rightY,
                rightPanelWidth,
                rightPanelHeight,
                0x000000,
                0.5
            )
            .setOrigin(0, 0)
            .setScrollFactor(0);
        let diplomacyText = this.add
            .text(
                rightX + rightPanelWidth / 2,
                rightY + rightPanelHeight / 2,
                "Diplomacy", {
                    font: "16px Arial",
                    fill: "#FFFFFF",
                    align: "center",
                }
            )
            .setOrigin(0.5)
            .setScrollFactor(0);
        this.uiPanelRight = this.add
            .container(0, 0, [rightBg, diplomacyText])
            .setScrollFactor(0);

        // Add invasion status panel
        this.invasionStatusPanel = this.add.rectangle(
            this.sys.game.config.width - 200,
            10,
            190,
            60,
            0x000000,
            0.6
        ).setOrigin(0, 0).setScrollFactor(0);

        this.invasionStatusText = this.add.text(
            this.sys.game.config.width - 195,
            15,
            "Invasion Status:\nFrontlines: 0",
            { font: "14px Arial", fill: "#ffffff" }
        ).setOrigin(0, 0).setScrollFactor(0);

        // Add to existing UI container or create new one
        this.uiPanelInvasion = this.add.container(0, 0, [this.invasionStatusPanel, this.invasionStatusText])
            .setScrollFactor(0);
    }

    updateUI() {
        // Use the stored playerCountryA3
        let selectedCountryA3 = this.playerCountryA3;
        // Find the corresponding A2 lowercase code for countryData lookup using the helper
        let selectedCountryA2Lower = this.getA2CodeFromA3(selectedCountryA3);

        // Ensure this.countryData is available before accessing it
        let countryData = selectedCountryA2Lower && this.countryData ?
            this.countryData[selectedCountryA2Lower] || {} : {};

        // For computeMilitary and UI text, we need the A2 lowercase code
        let military = selectedCountryA2Lower ?
            this.computeMilitary(selectedCountryA2Lower) :
            "N/A";
        let economy = countryData.economy || "N/A";

        // Ensure this.uiTextCenter exists before calling setText on it
        if (this.uiTextCenter) {
            this.uiTextCenter.setText(`Economy: ${economy}\nMilitary: ${military}`);
        } else {
             console.warn("updateUI: this.uiTextCenter is undefined.");
        }


        // Update invasion stats
        let frontlines = 0;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.territoryControl[y] && this.territoryControl[y][x] > 30 && this.territoryControl[y][x] < 70) { // Add bounds check
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
                if (this.territoryGrid[y] && this.territoryGrid[y][x]) { // Add bounds check
                    if (this.territoryGrid[y][x] !== selectedCountry && this.territoryControl[y] && this.territoryControl[y][x] > 60) { // Add bounds check
                        enemyTerritoryControlled++;
                    } else if (this.territoryGrid[y][x] === selectedCountry && this.territoryControl[y] && this.territoryControl[y][x] < 40) { // Add bounds check
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
        } else {
             console.warn("updateUI: this.invasionStatusText is undefined.");
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#0077be",
    parent: "gameCanvas",
    scene: MainScene,
    scale: {
        mode: Phaser.Scale.RESIZE, // Add RESIZE mode to handle window resizing
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};
const game = new Phaser.Game(config);
