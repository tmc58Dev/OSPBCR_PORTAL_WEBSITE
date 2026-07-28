const participants = [

    {
        name: "Dr. Rajesh Kumar",
        designation: "Oncologist",
        district: "Khordha",
        image: "assets/IMAGES_PDF_PPT_EXCEL/hero/rathyatra.jpg"
    },

    {
        name: "Dr. Ananya Mishra",
        designation: "Medical Officer",
        district: "Cuttack",
        image: "assets/IMAGES_PDF_PPT_EXCEL/hero/rathyatra.jpg"
    },

    {
        name: "Mr. Suresh Das",
        designation: "Data Officer",
        district: "Puri",
        image: "assets/IMAGES_PDF_PPT_EXCEL/hero/rathyatra.jpg"
    },

    {
        name: "Dr. Priya Patnaik",
        designation: "Public Health Specialist",
        district: "Angul",
        image: "assets/IMAGES_PDF_PPT_EXCEL/hero/rathyatra.jpg"
    },

    {
        name: "Dr. Manoj Sahoo",
        designation: "Oncologist",
        district: "Khordha",
        image: "assets/IMAGES_PDF_PPT_EXCEL/hero/rathyatra.jpg"
    },

    {
        name: "Dr. Deepak Mohanty",
        designation: "Medical Officer",
        district: "Cuttack",
        image: "assets/IMAGES_PDF_PPT_EXCEL/hero/rathyatra.jpg"
    }

];

const grid = document.getElementById("participantsGrid");

const t = (key, replacements = {}) => {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
};

function renderParticipants(data) {

    grid.innerHTML = "";

    data.forEach(person => {

        grid.innerHTML += `

            <div class="participant-card fade-up">

                <div class="participant-image">

                    <img src="${person.image}" alt="${person.name}">

                </div>

                <h3 class="participant-name">
                    ${person.name}
                </h3>

                <p class="participant-designation">
                    ${t(person.designation)}
                </p>

                <p class="participant-district">
                    ${t(person.district)}
                </p>

            </div>

        `;
    });

}

renderParticipants(participants);

document.addEventListener("languagechange", filterParticipants);

const searchInput =
document.getElementById("searchInput");

const districtFilter =
document.getElementById("districtFilter");

const designationFilter =
document.getElementById("designationFilter");

function filterParticipants() {

    let filtered = participants.filter(person => {

        const searchMatch =
        person.name.toLowerCase()
        .includes(searchInput.value.toLowerCase());

        const districtMatch =
        districtFilter.value === "" ||
        person.district === districtFilter.value;

        const designationMatch =
        designationFilter.value === "" ||
        person.designation === designationFilter.value;

        return (
            searchMatch &&
            districtMatch &&
            designationMatch
        );

    });

    renderParticipants(filtered);

}

searchInput.addEventListener(
    "input",
    filterParticipants
);

districtFilter.addEventListener(
    "change",
    filterParticipants
);

designationFilter.addEventListener(
    "change",
    filterParticipants
);

document
.getElementById("sortBy")
.addEventListener("change", e => {

    let sorted = [...participants];

    if(e.target.value === "name"){

        sorted.sort((a,b)=>
            a.name.localeCompare(b.name)
        );

    }

    if(e.target.value === "district"){

        sorted.sort((a,b)=>
            a.district.localeCompare(b.district)
        );

    }

    if(e.target.value === "designation"){

        sorted.sort((a,b)=>
            a.designation.localeCompare(b.designation)
        );

    }

    renderParticipants(sorted);

});
