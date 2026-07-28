const facilities = [

    {
        district:"Khordha",
        hospital:"AIIMS Bhubaneswar",
        type:"Government",
        cases:1520
    },

    {
        district:"Khordha",
        hospital:"Capital Hospital",
        type:"Government",
        cases:1125
    },

    {
        district:"Cuttack",
        hospital:"SCB Medical College",
        type:"Government",
        cases:2380
    },

    {
        district:"Puri",
        hospital:"District Headquarters Hospital",
        type:"Government",
        cases:725
    },

    {
        district:"Sambalpur",
        hospital:"VIMSAR",
        type:"Government",
        cases:1180
    },

    {
        district:"Balangir",
        hospital:"Bhima Bhoi Medical College",
        type:"Government",
        cases:650
    },

    {
        district:"Ganjam",
        hospital:"MKCG Medical College",
        type:"Government",
        cases:1825
    },

    {
        district:"Cuttack",
        hospital:"ABC Cancer Centre",
        type:"Private",
        cases:480
    },

    {
        district:"Khordha",
        hospital:"XYZ Oncology Clinic",
        type:"Private",
        cases:390
    },

    {
        district:"Sundargarh",
        hospital:"IGH Rourkela",
        type:"Government",
        cases:870
    },

    {
        district:"Mayurbhanj",
        hospital:"PRM Medical College",
        type:"Government",
        cases:790
    },

    {
        district:"Koraput",
        hospital:"SLN Medical College",
        type:"Government",
        cases:560
    }

];

const tableBody =
document.getElementById("facilityTableBody");

const pageInfo =
document.getElementById("facilityPageInfo");

let currentPage = 1;

const rowsPerPage = 8;

let filteredData = [...facilities];

const t = (key, replacements = {}) => {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
};

function renderFacilities() {

    tableBody.innerHTML = "";

    const start =
    (currentPage - 1) * rowsPerPage;

    const end =
    start + rowsPerPage;

    const pageData =
    filteredData.slice(start,end);

    pageData.forEach(item => {

        tableBody.innerHTML += `

        <tr>

            <td>${t(item.district)}</td>

            <td>${item.hospital}</td>

            <td>${t(item.type)}</td>

            <td>${item.cases}</td>

        </tr>

        `;

    });

    pageInfo.textContent = t("Page {{page}}", { page: currentPage });

}

renderFacilities();

document.addEventListener("languagechange", renderFacilities);

document
.getElementById("facilitySearch")
.addEventListener("input", function(){

    const value =
    this.value.toLowerCase();

    filteredData =
    facilities.filter(item =>

        item.hospital.toLowerCase().includes(value)

        ||

        item.district.toLowerCase().includes(value)

        ||

        (window.i18n?.t(item.district) || item.district).toLowerCase().includes(value)

    );

    currentPage = 1;

    renderFacilities();

});

document
.getElementById("facilityType")
.addEventListener("change", function(){

    const type = this.value;

    if(type === ""){

        filteredData = [...facilities];

    }

    else{

        filteredData =
        facilities.filter(item =>
            item.type === type
        );

    }

    currentPage = 1;

    renderFacilities();

});

document
.getElementById("nextFacility")
.addEventListener("click", ()=>{

    if(
        currentPage <
        Math.ceil(
            filteredData.length /
            rowsPerPage
        )
    ){

        currentPage++;

        renderFacilities();

    }

});

document
.getElementById("prevFacility")
.addEventListener("click", ()=>{

    if(currentPage > 1){

        currentPage--;

        renderFacilities();

    }

});

document
.getElementById("exportCSV")
.addEventListener("click", ()=>{

    let csv =
    "District,Hospital,Facility Type,Cases\n";

    filteredData.forEach(item => {

        csv +=

        `${item.district},
        ${item.hospital},
        ${item.type},
        ${item.cases}\n`;

    });

    const blob =
    new Blob([csv],
    {type:"text/csv"});

    const url =
    URL.createObjectURL(blob);

    const a =
    document.createElement("a");

    a.href = url;

    a.download =
    "ospbcr-data-sources.csv";

    a.click();

});
