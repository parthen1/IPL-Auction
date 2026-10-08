const TEAM_BRANDS = {
    MI: {
        name: 'Mumbai Indians',
        primary: '#004BA0',
        secondary: '#D1AB3E',
        text: '#FFFFFF',
        surface: '#E8F1FF'
    },
    CSK: {
        name: 'Chennai Super Kings',
        primary: '#F9CD05',
        secondary: '#0081C8',
        text: '#1A1A1A',
        surface: '#FFF9D9'
    },
    RCB: {
        name: 'Royal Challengers Bengaluru',
        primary: '#D71920',
        secondary: '#000000',
        text: '#FFFFFF',
        surface: '#FEECEE'
    },
    KKR: {
        name: 'Kolkata Knight Riders',
        primary: '#3A225D',
        secondary: '#F5C542',
        text: '#FFFFFF',
        surface: '#F4EFFF'
    },
    SRH: {
        name: 'Sunrisers Hyderabad',
        primary: '#F26522',
        secondary: '#000000',
        text: '#FFFFFF',
        surface: '#FFF1E8'
    },
    DC: {
        name: 'Delhi Capitals',
        primary: '#17479E',
        secondary: '#E4002B',
        text: '#FFFFFF',
        surface: '#EEF4FF'
    },
    RR: {
        name: 'Rajasthan Royals',
        primary: '#EA1A85',
        secondary: '#254AA5',
        text: '#FFFFFF',
        surface: '#FFF0F8'
    },
    PBKS: {
        name: 'Punjab Kings',
        primary: '#DD1F2D',
        secondary: '#A7A9AC',
        text: '#FFFFFF',
        surface: '#FFF0F1'
    },
    LSG: {
        name: 'Lucknow Super Giants',
        primary: '#00B5E2',
        secondary: '#DA291C',
        text: '#FFFFFF',
        surface: '#ECFBFF'
    },
    GT: {
        name: 'Gujarat Titans',
        primary: '#1C1C1C',
        secondary: '#C5A24A',
        text: '#FFFFFF',
        surface: '#F5F5F5'
    }
};

const DEFAULT_BRAND = {
    name: 'IPL Team',
    primary: '#1F2937',
    secondary: '#4B5563',
    text: '#FFFFFF',
    surface: '#F3F4F6'
};

export const getFantasyTeamBrand = (teamCode = '') => TEAM_BRANDS[String(teamCode).toUpperCase()] || DEFAULT_BRAND;

export const getFantasyTeamGradient = (teamCode = '') => {
    const brand = getFantasyTeamBrand(teamCode);
    return `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})`;
};

export const buildFantasyTeamLogoMap = (teams = []) => teams.reduce((acc, team) => {
    const code = String(team.code || team.id || '').toUpperCase();
    if (code && team.logo) {
        acc[code] = team.logo;
    }
    return acc;
}, {});
