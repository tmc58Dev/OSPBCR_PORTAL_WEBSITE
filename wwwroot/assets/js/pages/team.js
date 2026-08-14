const fallbackPortrait = "assets/IMAGES_PDF_PPT_EXCEL/hero/Cancer Registry.webp";

const teamSections = [
    {
        title: "Department of Health and Family Welfare, Government of Odisha",
        members: [
            {
                name: "Ms. Ashwathy S IAS",
                designation: "Health Secretary",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Ms. Ashwathy S IAS.webp?v=20260811-photo-v2"
            },
            {
                name: "Dr. Rabindra Nath Mishra",
                designation: "Director Public Health",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Rabindra Nath Mishra.webp?v=20260811"
            },
            {
                name: "Dr. Pramila Baral",
                designation: "Senior Administrative Grade",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Pramila Baral.webp?v=20260811"
            },
            {
                name: "Dr. Binay Kumar Dasmohapatra",
                designation: "ADNCD",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Binay Kumar Dasmohapatra.webp?v=20260811"
            },
            {
                name: "Dr. Roma Rattan",
                designation: "Joint Director, DMET",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Roma Rattan.webp?v=20260811"
            },
            {
                name: "Dr. Nilakantha Mishra",
                designation: "Former DPH",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Nilakantha Mishra.webp?v=20260811"
            },
            {
                name: "Chief District Medical Officers (CDMOs) of all districts",
                designation: "District Health Leadership"
            }
        ]
    },
    {
        title: "Tata Memorial Centre (TMC), Mumbai",
        members: [
            {
                name: "Dr Sudeep Gupta",
                designation: "Director, TMC",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Sudeep Gupta.webp?v=20260805"
            },
            {
                name: "Dr Pankaj Chaturvedi",
                designation: "Director, ACTREC, TMC",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Pankaj_chaturvedi.webp?v=20260805"
            },
            {
                name: "Dr Rajesh Dikshit",
                designation: "Director, CCE, TMC",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr.Dikshit.jpg?v=20260805"
            },
            {
                name: "Dr Gauravi Mishra",
                designation: "Deputy Director, CCE, TMC",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Gauravi Mishra.webp?v=20260805"
            },
            {
                name: "Dr Atul Budukh",
                designation: "Professor, Epidemiology",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/ATUL B.webp?v=20260801-photo-v2"
            },
            {
                name: "Dr Lingaraj Nayak",
                designation: "Professor, Medical Oncology",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr Lingaraj.webp?v=20260805"
            }
        ]
    },
    {
        title: "National Institute of Science Education and Research (NISER), Jatni, Odisha",
        members: [
            {
                name: "Prof. Hirendra Nath Ghosh",
                designation: "Director, NISER",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Hirendranath Ghosh.webp"
            },
            {
                name: "Prof. A. Srinivasan",
                designation: "Dean, Faculty Affairs",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/A . Srinivasan.webp"
            },
            {
                name: "Prof. Bedangadas Mohanty",
                designation: "Head, Centre for Medical & Radiation Physics",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Bedangdas Mohanty.webp"
            },
            {
                name: "Mr. Abhay Kumar Mohanty",
                designation: "Administrative Officer",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Mr. Abhay Kumar Mohanty.webp?v=20260811"
            },
            {
                name: "Mr. Prasanna Kumar Muduli",
                designation: "Scientific Officer"
            },
            {
                name: "Dr. Bandita Dash",
                designation: "Scientific Officer (Medical)",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Bandita Dash.webp"
            },
            {
                name: "Dr. Biswajit Dash",
                designation: "Scientific Officer",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Biswajit Dash.webp?v=20260811"
            }
        ]
    },
    {
        title: "Odisha State PBCR Staff",
        members: [
            {
                name: "Dr. Shubham Sritam Samantaray",
                designation: "State Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Shubham Sritam Samantaray.webp"
            },
            {
                name: "Dr. Sourav Dey",
                designation: "Statistician",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Sourav Dey.webp"
            },
            {
                name: "Mr. Shantanu Rewatkar",
                designation: "Programmer",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Mr. Shantanu Rewatkar.webp"
            },
            {
                name: "Dr. Asutosh Pradhan",
                designation: "Zonal Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Asutosh Pradhan.webp"
            },
            {
                name: "Ms. Jogita Khamari",
                designation: "Zonal Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Ms. Jogita Khamari.webp"
            },
            {
                name: "Mr. Swastik Suman Dash",
                designation: "Zonal Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Mr. Swastik Suman Dash.webp"
            },
            {
                name: "Mr. Akshay Ranjan Patro",
                designation: "Zonal Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Mr. Akshay Ranjan Patro.webp"
            },
            {
                name: "Ms. Rasmita Sahoo",
                designation: "Zonal Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Ms. Rasmita Sahoo.webp"
            },
            {
                name: "Dr. Priyanka Swain",
                designation: "Zonal Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Dr. Priyanka Swain.webp"
            }
        ]
    },
    {
        title: "Centre for Cancer Epidemiology (CCE), TMC, Mumbai",
        members: [
            {
                name: "Dr Suvarna Gore",
                designation: "Scientific Officer",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Suvarna Gore.webp"
            },
            {
                name: "Ms Sushama Saoba",
                designation: "Scientific Assistant",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Sushma.webp"
            },
            {
                name: "Mrs Deepali Lokhande",
                designation: "Scientific Assistant",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Deepali.webp"
            },
            {
                name: "Ms Sonali Bagal",
                designation: "Research Co-ordinator",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Sonali.webp"
            },
            {
                name: "Mr Pratik Sawant",
                designation: "Senior Programmer",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Pratik Sawant.webp?v=20260801-photo-v2"
            },
            {
                name: "Mr Vinay Tawde",
                designation: "Programmer",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/VINAY TAWDE.webp?v=20260803-photo-v2"
            }
        ]
    }
];

const teamGrid = document.getElementById("teamGrid");

const t = (key, replacements = {}) => {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
};

function getInitials(name) {
    return name
        .replace(/\([^)]*\)/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
}

function renderPortrait(member) {
    if (member.image) {
        return `
            <img
                src="${member.image}"
                alt="${member.name}"
            >
        `;
    }

    return `
        <img
            src="${fallbackPortrait}"
            alt=""
            aria-hidden="true"
        >
        <span class="team-initials">${getInitials(member.name)}</span>
    `;
}

function renderTeam() {

    teamGrid.innerHTML = teamSections.map((section) => `
        <section class="team-group fade-up">
            <div class="team-group-heading">
                <h2>${t(section.title)}</h2>
            </div>

            <div class="team-section-grid">
                ${section.members.map((member) => `
                    <article class="team-card fade-up">
                        <div class="team-image ${member.image ? "" : "team-image-placeholder"}">
                            ${renderPortrait(member)}
                        </div>

                        <div class="team-content">
                            <h3 class="team-name">${member.name}</h3>
                            <p class="team-designation">${t(member.designation)}</p>
                        </div>
                    </article>
                `).join("")}
            </div>
        </section>
    `).join("");

}

renderTeam();

document.addEventListener("languagechange", renderTeam);
