const fallbackPortrait = "assets/IMAGES_PDF_PPT_EXCEL/hero/Cancer Registry.webp";

const teamSections = [
    {
        title: "Department of Health and Family Welfare, Government of Odisha",
        members: [
            {
                name: "Smt Aswathy S.",
                designation: "Commissioner cum Secretary"
            },
            {
                name: "Dr Nilakantha Mishra",
                designation: "Director of Public Health, Odisha"
            },
            {
                name: "Dr Susanta Kumar Swain",
                designation: "Additional Director NCD cum State Nodal Officer, Cancer Care",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Sushanta Swain.webp"
            },
            {
                name: "Dr Roma Rattan",
                designation: "Additional DMET"
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
                designation: "Director, TMC"
            },
            {
                name: "Dr Pankaj Chaturvedi",
                designation: "Director, ACTREC, TMC"
            },
            {
                name: "Dr Rajesh Dikshit",
                designation: "Director, CCE, TMC"
            },
            {
                name: "Dr Gauravi Mishra",
                designation: "Deputy Director, CCE, TMC"
            },
            {
                name: "Dr Atul Budukh",
                designation: "Professor, Epidemiology",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/ATUL B.webp?v=20260801-photo-v2"
            },
            {
                name: "Dr Lingaraj Nayak",
                designation: "Professor, Medical Oncology"
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
                name: "Mr Abhaya Kumar Mohanty",
                designation: "Administrative Officer-II",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Abhay Mohanty.webp"
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
                name: "Dr. Biswajit Mishra",
                designation: "Scientific Officer (Medical)"
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
            },
            {
                name: "Ms Samyukta Shivshankar",
                designation: "Project Manager",
                image: "assets/IMAGES_PDF_PPT_EXCEL/OUR TEAM/Samyukta Shivshankar.webp"
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
