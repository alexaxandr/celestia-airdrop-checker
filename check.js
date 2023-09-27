import axios from "axios"
import { readWallets, sleep, writeLineToFile } from "./utils/common.js"
import { HttpsProxyAgent } from "https-proxy-agent"

const capsolverKey = 'CAP-xxx'

async function solveCaptcha() {
    let token = ''
    let done = false
    
    while (!done) {
        const captchaTaskResponse = await axios.post('https://api.capsolver.com/createTask', {
            clientKey: capsolverKey,
            task: {
                "type": "RecaptchaV3TaskProxyless",
                "websiteURL": "https://genesis.celestia.org/",
                "websiteKey": "6LdapFooAAAAAD6Zv0lIfouRC5DrNHtsXK-I7elY",
                "pageAction": 'submit'
            }
        }).then(async taskResponse => {
            while (token === '') {
                const captchaResponse = await axios.post('https://api.capsolver.com/getTaskResult', {
                    clientKey: capsolverKey,
                    taskId: taskResponse.data.taskId
                }).then(async res => {
                    if (res.data.status === 'ready') {
                        token = res.data.solution.gRecaptchaResponse
                        done = true
                    }
                }).catch(error => {
                    console.log(error.toString())
                })
            }
        }).catch(error => {
            console.log(error.toString())
        })
    }

    return token
}

async function checkWallet(wallet, proxy = null) {
    let token
    let done = false
    let agent

    token = await solveCaptcha()

    if (proxy) {
       agent = new HttpsProxyAgent(proxy) 
    }

    while (!done) {
        if (token) {
            await axios.get(`https://genesis-api.celestia.org/api/v1/airdrop/eligibility/${wallet}?recaptcha_token=${token}`, {
                httpAgent: proxy ? agent : null
            })
            .then(tiaRes => {
                console.log(wallet, tiaRes.data.slug)
                writeLineToFile('./eligible.txt', wallet)
                done = true
            }).catch(async e => {
                console.log(wallet, e.response.data.slug)
                if (e.response.data.slug === 'not-eligible') {
                    done = true
                } else {
                    console.log(wallet, 'retry')
                    token = await solveCaptcha()
                    await sleep(1000)
                }
            })
        }
    }
}

let wallets = readWallets('./wallets.txt')
let proxies = readWallets('./proxies.txt')

const args = process.argv.slice(2)
let multithread = true
if (args[0]) {
    multithread = false
}

for (const [index, wallet] of wallets.entries()) {
    if (multithread) {
        if (proxies.length) {
            checkWallet(wallet, proxies[index])
        } else {
            checkWallet(wallet)
        }
    } else {
        if (proxies.length) {
            await checkWallet(wallet, proxies[index])
        } else {
            await checkWallet(wallet)
        }
    }
}