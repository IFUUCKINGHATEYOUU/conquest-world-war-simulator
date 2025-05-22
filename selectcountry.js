fetch("countries.json")
.then(response => response.json())
.then(data => {
    const countriesList = document.getElementById("countriesList");
    const searchBar = document.getElementById("searchBar");

    function displayCountries(filter = "") {
        countriesList.innerHTML = "";  // Clear list before displaying

        Object.entries(data).forEach(([key, country]) => {
            if (country.name.toLowerCase().includes(filter.toLowerCase())) {
                const countryDiv = document.createElement("div");
                countryDiv.classList.add("country-option");

                // Use "syria.png" for Syria instead of FlagCDN
                const flagSrc = key.toLowerCase() === "sy" ? "syria.png" : `https://flagcdn.com/w40/${key}.png`;

                countryDiv.innerHTML = `
                    <img src="${flagSrc}" alt="${country.name} Flag">
                    <h2>${country.name}</h2>
                    <p>Population: ${country.population.toLocaleString()}</p>
                    <p>Economy: $${country.economy.toLocaleString()} GDP</p>
                    <p>Military: ${country.military_size.toLocaleString()} troops</p>
                `;

                countryDiv.addEventListener("click", () => {
                    localStorage.setItem("selectedCountry", key);
                    localStorage.setItem("selectedCountryName", country.name);
                    window.location.href = "game.html";  // Redirect to game after selection
                });

                countriesList.appendChild(countryDiv);
            }
        });
    }

    // Initial display of all countries
    displayCountries();

    // Search functionality: Filter as the user types
    searchBar.addEventListener("input", (event) => {
        displayCountries(event.target.value);
    });
})
.catch(error => console.error("Error loading country data:", error));
