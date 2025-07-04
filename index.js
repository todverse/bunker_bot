const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();
import { CronJob } from 'cron'
const { register, create_game, join_game, getActiveGamesByMember, start_game, updateGameUserData, updateGameActiveUser, updateGameCountLeave, updateGameOwner, end_game, updateUserCreating, updateGameVoiting } = require('./db.js')

const { data_translate } = require('./userData.js')

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const main_menu = [['Начать игру ✨']]

const sub_menu = [['В главное меню']]

const start_msg = 'Привет! 👋 Пидарас'

const creatingUsers = new Set();

const voitingGame =  new Set();

function chunkArray(array, chunkSize) {
  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.username;
    const bot_data = await bot.getMe()
    let activeGames = null
    const reply_markup = {
        keyboard: main_menu,
        resize_keyboard: true,
        one_time_keyboard: false
    }
    if (msg.text) {
        let user = ''
        let code = ''
        if(msg.text.includes('/start')) {
            user = await register(userId, userName)
            command = msg.text.split(' ')[1] ?? ''
            if(command.includes('join_game')) {
                code = msg.text.split('join_game')[1] ?? ''
                if(code) {
                    let game = await join_game(userId, code)
                    if(game) {
                        if(game.gameStarted) {
                            bot.sendMessage(chatId, `Игра ${game.game.name} уже началась`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                            return
                        }
                        reply_markup.keyboard = [['ОК']]
                        if(game.registred) {
                            bot.sendMessage(chatId, `Вы уже добавлены в игру ${game.game.name}`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                            return
                        }
                        bot.sendMessage(chatId, `Успешная регистрация в игре ${game.game.name}`, {
                            reply_markup,
                            parse_mode: 'HTML'
                        });
                    }
                }
                return
            }
            bot.sendMessage(chatId, start_msg, {
                reply_markup,
                parse_mode: 'HTML'
            });
            return;
        }
        user = await register(userId, userName)

        activeGames = await getActiveGamesByMember(userId)

        if(activeGames) {
            if(!activeGames.started_at) {
                switch(msg.text) {
                    case 'Запустить игру':
                        let game = await start_game(activeGames.id)
                        reply_markup.keyboard = [['Список игроков']]
                        for(let i = 0; i < game.users.length; i++) {
                            bot.sendMessage(game.users_data[game.users[i]].user.telegram_id, ` Игра ${game.name} началась`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                            bot.sendMessage(game.users_data[game.users[i]].user.telegram_id, `${game.history}`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                        }
                        break;
                    default:
                        if(activeGames.owner == user.id) {
                            reply_markup.keyboard = [['Запустить игру']]
                        } else {
                            reply_markup.keyboard = [['ОК']]
                        }
                        bot.sendMessage(chatId, 'Ожидайте начала игры!', {
                            reply_markup,
                            parse_mode: 'HTML'
                        });
                }
            } else {
                let keyboard_users = []
                activeGames.active_users.forEach((uid) => {
                    keyboard_users.push(activeGames.users_data[uid].user.username)
                })
                reply_markup.keyboard = chunkArray(keyboard_users, 2)
                if(activeGames.is_voiting) {
                    let curr_usr = false
                    if(msg.text == 'ИЗГНАТЬ') {
                        if(activeGames.count_leave) {
                            activeGames.count_leave++
                        } else {
                            activeGames.count_leave = 1
                        }
                        if(activeGames.count_leave < activeGames.active_users.length - 1) {
                            await updateGameCountLeave(activeGames)
                            return
                        }
                        activeGames.count_leave = 0
                        await updateGameCountLeave(activeGames)
                        activeGames.is_voiting = false
                        await updateGameVoiting(activeGames)
                        let usr_with_max = null
                        let max = 0
                        for(let i = 0; i < activeGames.active_users.length; i++) {
                            if(activeGames.users_data[activeGames.active_users[i]].voites > max) {
                                usr_with_max = activeGames.users_data[activeGames.active_users[i]].user.id
                                max = Number(activeGames.users_data[activeGames.active_users[i]].voites)
                            } else if(activeGames.users_data[activeGames.active_users[i]].voites == max) {
                                usr_with_max = null
                                max = Number(activeGames.users_data[activeGames.active_users[i]].voites)
                            }
                        }
                        if(usr_with_max) {
                            bot.sendMessage(activeGames.users_data[usr_with_max].user.telegram_id, `ТЫ МЕРТВ, ПОКА!`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                            activeGames.active_users = activeGames.active_users.filter(item => item != usr_with_max);
                            if(activeGames.owner == usr_with_max) {
                                activeGames.owner = activeGames.active_users[0]
                                await updateGameOwner(activeGames)
                            }
                            keyboard_users = []
                            activeGames.active_users.forEach((uid) => {
                                keyboard_users.push(activeGames.users_data[uid].user.username)
                            })
                            reply_markup.keyboard = chunkArray(keyboard_users, 2)
                            for(let i = 0; i < activeGames.active_users.length; i++) {
                                activeGames.users_data[activeGames.active_users[i]].voites = 0
                                activeGames.users_data[activeGames.active_users[i]].voite_to = null
                                if(activeGames.active_users[i] != usr_with_max) {
                                    let str = 'Характеристики убитого: \n'
                                    Object.keys(data_translate).forEach((key) => {
                                        str += data_translate[key] + ': '
                                        str += activeGames.users_data[usr_with_max].parameter[key]? activeGames.users_data[usr_with_max].parameter[key]: 'скрыто'
                                        str += '\n'
                                    })
                                    bot.sendMessage(activeGames.users_data[activeGames.active_users[i]].user.telegram_id, `Молодцы, а теперь посмотрите кого вы выгнали на верную погибель: \n${str}`, {
                                        reply_markup,
                                        parse_mode: 'HTML'
                                    });
                                }
                            }
                            await updateGameUserData(activeGames)
                            await updateGameActiveUser(activeGames)
                        }
                    }
                    activeGames.active_users.forEach((uid) => {
                        if(msg.text == activeGames.users_data[uid].user.username) {
                            curr_usr = uid
                        }
                    })
                    if(curr_usr && !activeGames.users_data[user.id].voite_to) {
                        activeGames.users_data[user.id].voite_to = activeGames.users_data[curr_usr].user.id
                        if(!activeGames.users_data[user.id].voites) {
                            activeGames.users_data[user.id].voites = 0
                        }
                        if(activeGames.users_data[curr_usr].voites) {
                            activeGames.users_data[curr_usr].voites++
                        } else {
                            activeGames.users_data[curr_usr].voites = 1
                        }
                        await updateGameUserData(activeGames)
                        let all_active_voite = 0
                        activeGames.active_users.forEach((uid) => {
                            if(activeGames.users_data[uid].voite_to) {
                                all_active_voite++
                            }
                        })
                        if(all_active_voite == activeGames.active_users.length) {
                            let usr_with_max = null
                            let max = 0
                            for(let i = 0; i < activeGames.active_users.length; i++) {
                                if(activeGames.users_data[activeGames.active_users[i]].voites > max) {
                                    usr_with_max = activeGames.users_data[activeGames.active_users[i]].user.id
                                    max = Number(activeGames.users_data[activeGames.active_users[i]].voites)
                                } else if(activeGames.users_data[activeGames.active_users[i]].voites == max) {
                                    usr_with_max = null
                                    max = Number(activeGames.users_data[activeGames.active_users[i]].voites)
                                }
                                bot.sendMessage(activeGames.users_data[activeGames.active_users[i]].user.telegram_id, `Все игроки проголосовали! У тебя ${activeGames.users_data[activeGames.active_users[i]].voites}`, {
                                    reply_markup,
                                    parse_mode: 'HTML'
                                });
                            }
                            if(usr_with_max) {
                                bot.sendMessage(activeGames.users_data[usr_with_max].user.telegram_id, `Начинай оправдываться, ведь выгнать хотят именно тебя!`, {
                                    reply_markup,
                                    parse_mode: 'HTML'
                                });
                                for(let i = 0; i < activeGames.active_users.length; i++) {
                                    if(activeGames.active_users[i] != usr_with_max) {
                                        reply_markup.keyboard = [['ИЗГНАТЬ']]
                                        bot.sendMessage(activeGames.users_data[activeGames.active_users[i]].user.telegram_id, `Дайте ${activeGames.users_data[usr_with_max].user.username} шанс оправдаться.... Или выбросьте его на улицу умирать!`, {
                                            reply_markup,
                                            parse_mode: 'HTML'
                                        });
                                    }
                                }
                            } else {
                                activeGames.is_voiting = false
                                await updateGameVoiting(activeGames)
                                for(let i = 0; i < activeGames.active_users.length; i++) {
                                    activeGames.users_data[activeGames.active_users[i]].voites = 0
                                    activeGames.users_data[activeGames.active_users[i]].voite_to = null
                                    bot.sendMessage(activeGames.users_data[activeGames.active_users[i]].user.telegram_id, `Вы не пришли к единому мнению поэтому продолжаете врать, подлизываться и делать все что бы остаться в бункере!`, {
                                        reply_markup,
                                        parse_mode: 'HTML'
                                    });
                                }
                                await updateGameUserData(activeGames)
                            }
                        }
                    }
                    return
                }
                reply_markup.keyboard.push(['Посмотреть историю мира'])
                if(activeGames.owner == user.id) {
                    reply_markup.keyboard.push(['Начать голосование'])
                    reply_markup.keyboard.push(['Завершить игру'])
                }
                switch(msg.text) {
                    case 'Посмотреть историю мира':
                        bot.sendMessage(chatId, `${activeGames.history}`, {
                            reply_markup,
                            parse_mode: 'HTML'
                        });
                        break;
                    case 'Начать голосование':
                        for(let i = 0; i < activeGames.active_users.length; i++) {
                            bot.sendMessage(activeGames.users_data[activeGames.active_users[i]].user.telegram_id, `Выбери игрока которого надо изгнать из бункера!`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                        }
                        activeGames.is_voiting = true
                        await updateGameVoiting(activeGames)
                        break;
                    case 'Список игроков':
                        bot.sendMessage(chatId, `Выбери игрока и тебе покажет какие характеристики он открыл!`, {
                            reply_markup,
                            parse_mode: 'HTML'
                        });
                        break;
                    case 'Завершить игру':
                        let game = await end_game(activeGames)
                        reply_markup.keyboard = main_menu
                        let live_users = 'поздравляю этих игроков:\n'
                        for(let i = 0; i < activeGames.active_users.length; i++) {
                            live_users += `\n${activeGames.users_data[activeGames.active_users[i]].user.username}`
                        }
                        const options = {
                            timeZone: 'Europe/Saratov',
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric',
                            second: 'numeric'
                        };
                        for(let i = 0; i < activeGames.users.length; i++) {
                            bot.sendMessage(activeGames.users_data[activeGames.users[i]].user.telegram_id, `Игра завершилась, ${live_users} \n\nИгра началась в ${new Date(game.started_at).toLocaleString('ru-RU', options)}. \nЗакончилась ${new Date(game.ended_at).toLocaleString('ru-RU', options)}`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                        }
                        break;
                    default:
                        let curr_usr = false
                        let curr_char = false
                        activeGames.active_users.forEach((uid) => {
                            if(msg.text == activeGames.users_data[uid].user.username) {
                                curr_usr = uid
                            }
                        })
                        Object.keys(data_translate).forEach((key) => {
                            if(msg.text == data_translate[key]) {
                                curr_char = key
                            }
                        })
                        if(curr_usr && !curr_char) {
                            // let str = 'Закрытые параметры: \n'
                            // Object.keys(data_translate).forEach((key) => {
                            //     str += data_translate[key] + ': '
                            //     str += activeGames.users_data[curr_usr].parameter[key]? activeGames.users_data[curr_usr].parameter[key]: 'скрыто'
                            //     str += '\n'
                            // })
                            let character = []
                            let visible = `Характеристики игрока ${msg.text}: \n`
                            Object.keys(data_translate).forEach((key) => {
                                if(!activeGames.users_data[curr_usr].visible[key]) {
                                    character.push(data_translate[key])
                                }
                                visible += data_translate[key] + ': '
                                visible += activeGames.users_data[curr_usr].visible[key]? activeGames.users_data[curr_usr].visible[key]: 'скрыто'
                                visible += '\n'
                            })
                            await bot.sendMessage(chatId, `${visible}`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                            if(activeGames.users_data[curr_usr].user.telegram_id == userId) {
                                reply_markup.keyboard = [...chunkArray(character, 2), ['Список игроков']]
                                 let visible = `Все твои характеристики: \n`
                                Object.keys(data_translate).forEach((key) => {
                                    if(!activeGames.users_data[curr_usr].visible[key]) {
                                        character.push(data_translate[key])
                                    }
                                    visible += data_translate[key] + ': '
                                    visible += activeGames.users_data[curr_usr].parameter[key]? activeGames.users_data[curr_usr].parameter[key]: 'скрыто'
                                    visible += '\n'
                                })
                                await bot.sendMessage(chatId, `${visible}`, {
                                    reply_markup,
                                    parse_mode: 'HTML'
                                });
                                await bot.sendMessage(chatId, `Нажмите что бы открыть свою характеристику`, {
                                    reply_markup,
                                    parse_mode: 'HTML'
                                });
                            }
                        }
                        if(curr_char && !curr_usr) {
                            activeGames.users_data[user.id].visible[curr_char] = activeGames.users_data[user.id].parameter[curr_char]
                            await updateGameUserData(activeGames)
                            await bot.sendMessage(chatId, `Успешно открыли характеристику ${data_translate[curr_char]}`, {
                                reply_markup,
                                parse_mode: 'HTML'
                            });
                        }
                }
            }
            return
        }

        switch(msg.text) {
            case 'Начать игру ✨':
                user.is_creating = true
                await updateUserCreating(user)
                reply_markup.keyboard = sub_menu
                bot.sendMessage(chatId, `Введи название игры:`, {
                    reply_markup,
                    parse_mode: 'HTML'
                });
                break;
            case 'В главное меню':
                bot.sendMessage(chatId, start_msg, {
                    reply_markup,
                    parse_mode: 'HTML'
                });
                break;
            default:
                if(user.is_creating) {
                    let game = await create_game(userId, msg.text)
                    reply_markup.keyboard = [['Запустить игру']]
                    bot.sendMessage(chatId, `Игра с названием ${game.name} создана!
Отправь ссылку другу, что бы он присоеденился к ней

<code>t.me/${bot_data.username}?start=join_game${game.code}</code>`, {
                        reply_markup,
                        parse_mode: 'HTML'
                    });
                    user.is_creating = false
                    await updateUserCreating(user)
                } else {
                    bot.sendMessage(chatId, start_msg, {
                        reply_markup,
                        parse_mode: 'HTML'
                    });
                }
        }
    }
})

const app = express();

app.use(express.json({ limit: '20mb' }));

app.get('/', async (req, res) => {
    const bot_data = await bot.getMe()
    res.send(`Ссылка на бота https://t.me/${bot_data.username}`)
});

app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});

console.log('REGISTER CRON')
try {
    let a = await fetch('/', {
        method: 'GET'
    })
    a = await a.json()
    console.log(a)
} catch(e) {
    console.log(e)
}
new CronJob(
    '*/10 * * * *',//'0 * * * *'
    async function () {
        console.log('RUN CRON JOB')
        try {
            let a = await fetch('/', {
                method: 'GET'
            })
            a = await a.json()
            console.log(a)
        } catch(e) {
            console.log(e)
        }
    }, // onTick
    null, // onComplete
    true // start
)  