const teamSections = [
    {
        title: "Department of Health and Family Welfare, Government of Odisha",
        members: [
            {
                name: "Ms. Ashwathy S IAS",
                designation: "Health Secretary"
            },
            {
                name: "Dr. Rabindra Nath Mishra",
                designation: "Director Public Health"
            },
            {
                name: "Dr. Pramila Baral",
                designation: "Senior Administrative Grade"
            },
            {
                name: "Dr. Binay Kumar Dasmohapatra",
                designation: "ADNCD"
            },
            {
                name: "Dr. Roma Rattan",
                designation: "Joint Director, DMET"
            },
            {
                name: "Dr. Nilakantha Mishra",
                designation: "Former DPH"
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
                designation: "Professor, Epidemiology"
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
                designation: "Director, NISER"
            },
            {
                name: "Prof. A. Srinivasan",
                designation: "Dean, Faculty Affairs"
            },
            {
                name: "Prof. Bedangadas Mohanty",
                designation: "Head, Centre for Medical & Radiation Physics"
            },
            {
                name: "Mr. Abhay Kumar Mohanty",
                designation: "Administrative Officer"
            },
            {
                name: "Mr. Prasanna Kumar Muduli",
                designation: "Scientific Officer"
            },
            {
                name: "Dr. Bandita Dash",
                designation: "Scientific Officer (Medical)"
            },
            {
                name: "Dr. Biswajit Dash",
                designation: "Scientific Officer"
            }
        ]
    },
    {
        title: "Odisha State PBCR Staff",
        members: [
            {
                name: "Dr. Shubham Sritam Samantaray",
                designation: "State Co-ordinator"
            },
            {
                name: "Dr. Sourav Dey",
                designation: "Statistician"
            },
            {
                name: "Mr. Shantanu Rewatkar",
                designation: "Programmer"
            },
            {
                name: "Dr. Asutosh Pradhan",
                designation: "Zonal Co-ordinator"
            },
            {
                name: "Ms. Jogita Khamari",
                designation: "Zonal Co-ordinator"
            },
            {
                name: "Mr. Swastik Suman Dash",
                designation: "Zonal Co-ordinator"
            },
            {
                name: "Mr. Akshay Ranjan Patro",
                designation: "Zonal Co-ordinator"
            },
            {
                name: "Ms. Rasmita Sahoo",
                designation: "Zonal Co-ordinator"
            },
            {
                name: "Dr. Priyanka Swain",
                designation: "Zonal Co-ordinator"
            }
        ]
    },
    {
        title: "Centre for Cancer Epidemiology (CCE), TMC, Mumbai",
        members: [
            {
                name: "Dr Suvarna Gore",
                designation: "Scientific Officer"
            },
            {
                name: "Ms Sushama Saoba",
                designation: "Scientific Assistant"
            },
            {
                name: "Mrs Deepali Lokhande",
                designation: "Scientific Assistant"
            },
            {
                name: "Ms Sonali Bagal",
                designation: "Research Co-ordinator"
            },
            {
                name: "Mr Pratik Sawant",
                designation: "Senior Programmer"
            },
            {
                name: "Mr Vinay Tawde",
                designation: "Programmer"
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

function renderTeam() {

    teamGrid.innerHTML = teamSections.map((section) => `
        <section class="team-group fade-up">
            <div class="team-group-heading">
                <h2>${t(section.title)}</h2>
            </div>

            <div class="team-section-grid">
                ${section.members.map((member) => `
                    <article class="team-card fade-up">
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
