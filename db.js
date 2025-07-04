require('dotenv').config();
const { Pool } = require('pg');

const { sex, profession, health, phobia, hobby, fact_1, fact_2, luggage, data, histories } = require('./userData.js')

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const client = new Pool({
  connectionString: process.env.DATABASE_URL
});
const register = async (id, name, code) => {
    try {
        let res = await client.query('SELECT * FROM users WHERE telegram_id = $1', [id]);
        if(!res.rows.length) {
            // let inviter_id = null
            // let invite = await client.query('SELECT * FROM invites WHERE invitee_username = $1', [name]);
            if(code) {
                // let invite = await client.query('SELECT * FROM users WHERE code = $1', [code]);
                // if(invite.rows.length) {
                //     inviter_id = invite.rows[0].id
                // }
            }
            let user = await client.query(
                'INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING *',
                [id, name]
            );
            res = user
        }
        return res.rows[0]
    } catch(e) {
        console.log(e)
    }
}

const create_game = async (owner, name) => {
    let res = await client.query('SELECT * FROM users WHERE telegram_id = $1', [owner]);
    let game = null
    if(res.rows.length) {
        game = await client.query(
            'INSERT INTO games (owner, name, users) VALUES ($1, $2, $3) RETURNING *',
            [res.rows[0].id, name, JSON.stringify([res.rows[0].id])]
        );
    }
    return game.rows[0]
}

const start_game = async (id) => {
    let res = await client.query('SELECT * FROM games WHERE id = $1', [id]);
    if(res.rows.length) {
        res = res.rows[0]
        let users_data = {}
        let used_proff = []
        let used_heal = []
        let used_pho = []
        let used_hob = []
        let used_fac1 = []
        let used_fac2 = []
        let used_lug = []
        for(let i = 0; i < res.users.length; i++) {
            let u = await client.query('SELECT * FROM users WHERE id = $1', [res.users[i]]);
            let proff_index = getRandomInt(0, profession.length - 1)
            while(used_proff.includes(proff_index) && profession.length != res.users.length) {
                proff_index = getRandomInt(0, profession.length - 1)
            }
            used_proff.push(proff_index)

            let heal_index = getRandomInt(0, health.length - 1)
            while(used_heal.includes(heal_index) && health.length != res.users.length) {
                heal_index = getRandomInt(0, health.length - 1)
            }
            used_heal.push(heal_index)

            let pho_index = getRandomInt(0, phobia.length - 1)
            while(used_pho.includes(pho_index) && phobia.length != res.users.length) {
                pho_index = getRandomInt(0, phobia.length - 1)
            }
            used_pho.push(pho_index)

            let hob_index = getRandomInt(0, hobby.length - 1)
            while(used_hob.includes(hob_index) && hobby.length != res.users.length) {
                hob_index = getRandomInt(0, hobby.length - 1)
            }
            used_hob.push(hob_index)

            let fac1_index = getRandomInt(0, fact_1.length - 1)
            while(used_fac1.includes(fac1_index) && fact_1.length != res.users.length) {
                fac1_index = getRandomInt(0, fact_1.length - 1)
            }
            used_fac1.push(fac1_index)

            let fac2_index = getRandomInt(0, fact_2.length - 1)
            while(used_fac2.includes(fac2_index) && fact_2.length != res.users.length) {
                fac2_index = getRandomInt(0, fact_2.length - 1)
            }
            used_fac2.push(fac2_index)

            let lug_index = getRandomInt(0, luggage.length - 1)
            while(used_lug.includes(lug_index) && luggage.length != res.users.length) {
                lug_index = getRandomInt(0, luggage.length - 1)
            }
            used_lug.push(lug_index)

            users_data[res.users[i]] = {
                parameter: {
                    sex: sex[getRandomInt(0, sex.length - 1)],
                    age: getRandomInt(7, 100),
                    profession: profession[getRandomInt(0, profession.length - 1)], 
                    health: health[getRandomInt(0, health.length - 1)], 
                    phobia: phobia[getRandomInt(0, phobia.length - 1)], 
                    hobby: hobby[getRandomInt(0, hobby.length - 1)], 
                    fact_1: fact_1[getRandomInt(0, fact_1.length - 1)], 
                    fact_2: fact_2[getRandomInt(0, fact_2.length - 1)], 
                    luggage: luggage[getRandomInt(0, luggage.length - 1)]
                },
                visible: {},
                user: u.rows[0]
            }
        }
        res = await client.query(
            'UPDATE games SET users_data = $1, started_at = $2, active_users = $3, history = $4 WHERE id = $5 RETURNING *',
            [JSON.stringify(users_data), new Date().toISOString().replace('Z', '+00'), JSON.stringify(res.users), histories[getRandomInt(0, histories.length - 1)], id]
        );
        res = res.rows[0]
    }
    return res
}

const end_game = async (game) => {
    let res = await client.query(
        'UPDATE games SET ended_at = $1 WHERE id = $2 RETURNING *',
        [new Date().toISOString().replace('Z', '+00'), game.id]
    );
    return res.rows[0]
}

const join_game = async (id, code) => {
    let res = await client.query('SELECT * FROM users WHERE telegram_id = $1', [id]);
    let game = null
    let registred = false
    let gameStarted = true
    if(res.rows.length) {
        game = await client.query('SELECT * FROM games WHERE code = $1',[code]);
        if(game.rows.length) {
            let users = game.rows[0].users
            if(game.rows[0].started_at == null) {
                if(users) {
                    if(!users.includes(res.rows[0].id)) {
                        users.push(res.rows[0].id)
                    } else {
                        registred = true
                    }
                } else {
                    users = [res.rows[0].id]
                }
                await client.query(
                    'UPDATE games SET users = $1 WHERE id = $2',
                    [JSON.stringify(users), game.rows[0].id]
                );
                gameStarted = false
            }
            game = game.rows[0]
        } else {
            game = null
        }
    }
    return {game, registred, gameStarted}
}

const getActiveGamesByMember = async(id) => {
    let res = await client.query('SELECT * FROM users WHERE telegram_id = $1', [id]);
    let game = null
    if(res.rows.length) {
        game = await client.query(
            `SELECT * 
            FROM games
            WHERE ended_at IS NULL
            AND EXISTS (
                SELECT 1
                FROM json_array_elements_text(users) AS user_id
                WHERE user_id = $1
            )`,
            [res.rows[0].id]
        );
        console.log(game.rows)
        if(game.rows.length) {
            game = game.rows[0]
        } else {
            game = null
        }
    }
    return game
}

const updateGameUserData = async (game) => {
    await client.query(
        'UPDATE games SET users_data = $1 WHERE id = $2',
        [JSON.stringify(game.users_data), game.id]
    );
}

const updateGameActiveUser = async (game) => {
    await client.query(
        'UPDATE games SET active_users = $1 WHERE id = $2',
        [JSON.stringify(game.active_users), game.id]
    );
}

const updateGameCountLeave = async (game) => {
    await client.query(
        'UPDATE games SET count_leave = $1 WHERE id = $2',
        [game.count_leave, game.id]
    );
}

const updateGameOwner = async (game) => {
    await client.query(
        'UPDATE games SET owner = $1 WHERE id = $2',
        [game.owner, game.id]
    );
}

const updateGameVoiting = async (game) => {
    await client.query(
        'UPDATE games SET is_voiting = $1 WHERE id = $2',
        [game.is_voiting, game.id]
    );
}

const updateUserCreating = async (user) => {
    await client.query(
        'UPDATE users SET is_creating = $1 WHERE id = $2',
        [user.is_creating, user.id]
    );
}

module.exports = { register, create_game, join_game, getActiveGamesByMember, start_game, updateGameUserData, updateGameActiveUser, updateGameCountLeave, updateGameOwner, end_game, updateUserCreating, updateGameVoiting }