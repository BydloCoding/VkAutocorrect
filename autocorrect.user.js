// ==UserScript==
// @name         VK Autocorrect
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       SPRAVEDLIVO
// @match        https://vk.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=vk.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      github.com
// @connect      githubusercontent.com
// ==/UserScript==

(async function() {
    'use strict';
    const TRESHOLD = 0.5
    const TRESHOLD_RU = 0.5

    const s1 = new Array(
      "й","ц","у","к","е","н","г","ш","щ","з","х","ъ",
      "ф","ы","в","а","п","р","о","л","д","ж","э",
      "я","ч","с","м","и","т","ь","б","ю"
    )
    const s2 = new Array(
      "q","w","e","r","t","y","u","i","o","p","[","]",
      "a","s","d","f","g","h","j","k","l",";","'",
      "z","x","c","v","b","n","m",",","."
    )

    const en2ru = {};
    const ru2en = {};
    s2.forEach((key, i) => en2ru[key] = s1[i]);
    s1.forEach((key, i) => ru2en[key] = s2[i]);

    let xhr = GM_xmlhttpRequest
    GM_xmlhttpRequest = function (details) {
        return new Promise((resolve, reject) => {
            if (typeof details === 'string') {
                details = { 'url': details }
            }
            xhr({
                ...details,
                onload: function (request) {
                    resolve(request)
                    return
                }
            })
        })
    }
    let request = GM_xmlhttpRequest
    let json_request = async (details) => {
        return JSON.parse((await request(details)).responseText)
    }

    class Repository {
        constructor(name, use_branch) {
            this.name = name
            this.use_branch = use_branch
        }
        async get_file_contents(path) {
            return (await request(`https://raw.githubusercontent.com/${this.name}/${this.use_branch}/${path}`)).responseText
        }
        async get_latest_commit() {
            let json = await json_request(`https://api.github.com/repos/${this.name}/branches`)
            return json.find(it => it.name == this.use_branch)["commit"]["sha"]
        }
    }

    function translit(text, mode) {
        let answer = ''
        let ch, got
        let converter = mode == "en2ru" ? en2ru : ru2en
        for (var i = 0; i < text.length; ++i ) {
            ch = text[i]
            got = converter[ch]
            if (got === undefined){
                answer += ch;
            } else {
                answer += got;
            }
        }
        return answer
    }

    let r = new Repository("dwyl/english-words", "master")
    let ru = new Repository("BydloCoding/VkAutocorrect", "main")
    let hash = await r.get_latest_commit()
    let hash_ru = await r.get_latest_commit()
    let saved = GM_getValue("dict_commit_en", "")
    let saved_ru = GM_getValue("dict_commit_ru", "")

    if (hash != saved) {
        console.log("updating dictionary...")
        let content = await r.get_file_contents("words_alpha.txt")
        GM_setValue("dict_commit_en", hash)
        content = content.replace(/[\r]+/g, "").split("\n").map(it => it.toLowerCase())
        GM_setValue("content_en", JSON.stringify(content))
    }
    if (hash_ru != saved_ru) {
        console.log("updating dictionary...")
        let content = await ru.get_file_contents("russian.txt")
        GM_setValue("dict_commit_ru", hash_ru)
        content = content.replace(/[\r]+/g, "").split("\n").map(it => it.toLowerCase())
        GM_setValue("content_ru", JSON.stringify(content))
    }
    let words = new Set(JSON.parse(GM_getValue("content_en", "[]")))

    let words_ru = new Set(JSON.parse(GM_getValue("content_ru", "[]")))

    let english = /[a-z .,\[\]';]+$/g

    setInterval(() => {
        let messages = Array.from(document.querySelectorAll(".im-mess._im_mess .im-mess--text")).filter(it => !it.hasAttribute("vkac")).reverse().slice(0, 10)

        messages.forEach(message => {
            let children = Array.from(message.childNodes)
            let text = ""
            let replace_mode = ""
            if (children.length == 0) {text = message.textContent; replace_mode = "oneline"}
            else {
                replace_mode = "lines"
                for (let child of children) {
                    if (child.nodeName == "#text") {
                        text += child.nodeValue
                    }
                    else if (child.nodeValue == "BR") {
                        text += "\n"
                    }
                    else {
                        break
                    }
                }
            }
            let text_words = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/gm,"").replace(/\n*/gm, " ").replace(/\s{2,}/g," ").replace("\d*", "").split(" ") || []
            text_words = text_words.filter(it => it != '')
            // en2ru
            let translitirate = []
            for (let word of text_words) {
                let lowered = word.toLowerCase()
                if (english.test(lowered)) {
                    if (!words.has(lowered)) {
                        translitirate.push(lowered)
                    }
                }
            }

            let ratio = translitirate.length / (text_words.length || 1)
            if (ratio >= TRESHOLD) {
                translitirate = translitirate.map(it => words_ru.has(translit(it, "en2ru")))
                let ratio2 = translitirate.filter(Boolean).length / (translitirate.length || 1)
                if (ratio2 >= TRESHOLD_RU) {
                    if (replace_mode == "oneline") {
                        message.textContent = translit(message.textContent, "en2ru")
                    }   
                    else {
                        for (let child of children) {
                            if (child.nodeName == "#text") {
                                child.nodeValue = translit(child.nodeValue, "en2ru")
                            }
                        }
                    }
                }
            }
            message.setAttribute("vkac", "")
        })
    }, 2000)

})();