// ==UserScript==
// @name         终版代码
// @namespace    http://tampermonkey.net/
// @version      7.1-debug
// @description  逐行新增、逐行填写、逐行添加标签，带控制台调试日志
// @match        https://pceditor.jinma2025.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, '').trim();
    }

    function setNativeValue(el, value) {
        if (!el) return;

        const prototype = Object.getPrototypeOf(el);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        const setter = descriptor?.set;

        if (setter) setter.call(el, value);
        else el.value = value;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    }

    function realClick(el) {
        if (!el) return;

        el.scrollIntoView({ block: 'center', inline: 'center' });

        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    function getRows() {
        return [...document.querySelectorAll('tr.ant-table-row')];
    }

    function getAddButton() {
        return [...document.querySelectorAll('button')]
            .find(btn => normalizeText(btn.innerText).includes('新增'));
    }

    function parseLine(text) {
        const arr = text.split(':');

        return {
            title: arr[0]?.trim() || '',
            price: arr[1]?.trim() || '',
            views: arr[2]?.trim() || '',
            buys: arr[3]?.trim() || '',
            paidContent: arr[4]?.trim() || '',
            tagsRaw: arr.slice(5).join(':').trim() || ''
        };
    }

    function parseBatchText(text) {
        const lines = text.split('\n');
        const result = [];
        let current = '';

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            if (/^\d+期/.test(line)) {
                if (current) result.push(current);
                current = line;
            } else {
                current += '\n' + line;
            }
        }

        if (current) result.push(current);

        return result.map(parseLine);
    }

    function parseTags(raw) {
        return String(raw || '')
            .split('|')
            .map(v => v.trim())
            .filter(Boolean)
            .map(item => {
                const parts = item.split(',').map(v => v.trim());
                return {
                    text: parts[0],
                    color: parts[1],
                    style: parts[2]
                };
            });
    }

    async function clickAddOneAndGetRow() {
        const btn = getAddButton();

        console.group('【新增行调试】');

        if (!btn) {
            console.error('找不到新增按钮');
            console.groupEnd();
            alert('找不到新增按钮');
            return null;
        }

        console.log('找到新增按钮:', btn);
        realClick(btn);
        console.log('已点击新增按钮');

        for (let i = 0; i < 60; i++) {
            const rows = getRows();

            console.log(`第 ${i + 1} 次检查，当前行数:`, rows.length);

            const emptyRows = rows.filter((row, index) => {
                const titleInput = row.querySelector('input[placeholder="标题"]');
                const isEmpty = titleInput && !titleInput.value.trim();

                console.log(
                    `行 ${index} 标题值:`,
                    titleInput ? titleInput.value : '无标题输入框',
                    '是否空行:',
                    !!isEmpty
                );

                return isEmpty;
            });

            console.log('空标题行数量:', emptyRows.length);

            if (emptyRows.length) {
                const targetRow = emptyRows[emptyRows.length - 1];

                console.log('选中的新增行:', targetRow);
                console.log('新增行 outerHTML:', targetRow.outerHTML);

                console.groupEnd();
                return targetRow;
            }

            await sleep(300);
        }

        console.error('新增行失败：没有找到空标题的新行');
        console.groupEnd();

        alert('新增行失败：没有找到空标题的新行');
        return null;
    }

    function fillOneRowBasic(row, data) {
        console.group('【基础字段填充调试】');
        console.log('当前 row:', row);
        console.log('当前 data:', data);

        const titleInput = row.querySelector('input[placeholder="标题"]');
        const priceInput = row.querySelector('input[placeholder="价格"]');
        const numberInputs = [...row.querySelectorAll('input.ant-input-number-input')];
        const textareas = [...row.querySelectorAll('textarea')];
        const checkboxes = [...row.querySelectorAll('input[type="checkbox"]')];

        const viewsInput = numberInputs[1];
        const buysInput = numberInputs[2];
        const historyInput = numberInputs.find(v => v.getAttribute('aria-valuemax') === '100');

        const paidTextarea =
            row.querySelector('textarea[placeholder="付费内容"]') ||
            textareas[1];

        console.log('titleInput:', titleInput);
        console.log('priceInput:', priceInput);
        console.log('numberInputs:', numberInputs);
        console.log('paidTextarea:', paidTextarea);
        console.log('historyInput:', historyInput);
        console.log('checkboxes:', checkboxes);

        setNativeValue(titleInput, data.title);
        setNativeValue(priceInput, data.price);

        if (viewsInput) setNativeValue(viewsInput, data.views);
        if (buysInput) setNativeValue(buysInput, data.buys);
        if (paidTextarea) setNativeValue(paidTextarea, data.paidContent);
        if (historyInput) setNativeValue(historyInput, '7');

        if (checkboxes[2] && !checkboxes[2].checked) realClick(checkboxes[2]);
        if (checkboxes[3] && !checkboxes[3].checked) realClick(checkboxes[3]);
        if (checkboxes[4] && !checkboxes[4].checked) realClick(checkboxes[4]);

        console.groupEnd();
    }

    function getLabelModal() {
        return [...document.querySelectorAll('.ant-modal-content')]
            .find(modal => (modal.innerText || '').includes('标签'));
    }

    async function waitLabelModal(timeout = 10000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const modal = getLabelModal();
            if (modal) return modal;
            await sleep(200);
        }

        return null;
    }

    async function selectOption(selectBox, text) {
        const selector = selectBox.querySelector('.ant-select-selector') || selectBox;

        realClick(selector);
        await sleep(500);

        const wanted = normalizeText(text);
        const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')];

        let target = null;

        for (const dropdown of dropdowns) {
            const options = [...dropdown.querySelectorAll('.ant-select-item-option')];

            target = options.find(opt => normalizeText(opt.innerText) === wanted);

            if (target) break;
        }

        if (!target) {
            throw new Error(`没有找到选项：${text}`);
        }

        realClick(target);
        await sleep(400);
    }

    async function addOneTag(tagText, color, style) {
        console.group('【添加单个标签调试】');
        console.log('tagText:', tagText, 'color:', color, 'style:', style);

        const modal = await waitLabelModal();

        console.log('modal:', modal);

        if (!modal) {
            console.groupEnd();
            throw new Error('没有找到标签窗口');
        }

        const input = modal.querySelector('input[placeholder="标签内容"]');
        const selects = [...modal.querySelectorAll('.ant-select')];

        console.log('标签输入框:', input);
        console.log('下拉框:', selects);

        if (!input) {
            console.groupEnd();
            throw new Error('没有找到标签输入框');
        }

        if (selects.length < 2) {
            console.groupEnd();
            throw new Error('没有找到标签下拉框');
        }

        setNativeValue(input, tagText);

        await sleep(300);
        await selectOption(selects[0], color);

        await sleep(300);
        await selectOption(selects[1], style);

        await sleep(300);

        const addBtn = [...modal.querySelectorAll('button')]
            .find(btn => normalizeText(btn.innerText) === '添加');

        console.log('添加按钮:', addBtn);

        if (!addBtn) {
            console.groupEnd();
            throw new Error('没有找到添加按钮');
        }

        realClick(addBtn);
        await sleep(800);

        console.groupEnd();
    }

    async function fillTagsForRow(row, tagsRaw) {
        const tags = parseTags(tagsRaw);

        console.group('【标签查找调试】');
        console.log('传入 row:', row);
        console.log('传入 row outerHTML:', row ? row.outerHTML : 'row为空');
        console.log('原始 tagsRaw:', tagsRaw);
        console.log('解析后的 tags:', tags);

        if (!tags.length) {
            console.warn('没有解析到标签，跳过');
            console.groupEnd();
            return;
        }

        const cells = [...row.children];

        console.log('当前行 td 数量:', cells.length);

        cells.forEach((td, index) => {
            console.log(`第 ${index} 列文本:`, normalizeText(td.innerText));
            console.log(`第 ${index} 列 HTML:`, td.innerHTML);
        });

        const tagCell = row.children[11];

        console.log('预设标签列 row.children[11]:', tagCell);
        console.log('预设标签列 HTML:', tagCell ? tagCell.innerHTML : '不存在');

        if (!tagCell) {
            console.error('当前行没有标签列');
            console.groupEnd();
            alert('当前行没有标签列');
            return;
        }

        const allSpans = [...tagCell.querySelectorAll('span')];
        const allDivs = [...tagCell.querySelectorAll('div')];

        console.log('标签列 span 数量:', allSpans.length);
        allSpans.forEach((span, index) => {
            console.log(`span ${index} 文本:`, normalizeText(span.innerText), span);
        });

        console.log('标签列 div 数量:', allDivs.length);
        allDivs.forEach((div, index) => {
            console.log(`div ${index} 文本:`, normalizeText(div.innerText), div);
        });

        let clickTarget = allSpans.find(span => {
            const text = normalizeText(span.innerText);
            console.log('检查 span:', text);
            return text === '点击添加标签';
        });

        console.log('第一步 span 精准匹配结果:', clickTarget);

        if (!clickTarget) {
            clickTarget = allDivs.find(div => {
                const text = normalizeText(div.innerText);
                console.log('检查 div contains:', text);
                return text.includes('点击添加标签');
            });
        }

        console.log('第二步 div 包含匹配结果:', clickTarget);

        if (!clickTarget) {
            clickTarget = tagCell.querySelector('div div[style*="cursor"]');
            console.log('第三步 cursor 容器匹配结果:', clickTarget);
        }

        if (!clickTarget) {
            clickTarget = tagCell.querySelector('div div');
            console.log('第四步普通 div 容器匹配结果:', clickTarget);
        }

        if (!clickTarget) {
            console.error('最终没有找到标签点击区域');
            console.log('最终标签列 HTML:', tagCell.innerHTML);
            console.groupEnd();
            alert('当前行找不到标签点击区域，请打开控制台查看日志');
            return;
        }

        console.log('最终点击目标:', clickTarget);
        realClick(clickTarget);
        console.log('已点击标签区域，等待弹窗');

        const modal = await waitLabelModal();

        console.log('标签弹窗:', modal);

        if (!modal) {
            console.error('标签窗口没有弹出');
            console.groupEnd();
            alert('标签窗口没有弹出');
            return;
        }

        try {
            for (const tag of tags) {
                console.log('开始添加标签:', tag);
                await addOneTag(tag.text, tag.color, tag.style);
                console.log('完成添加标签:', tag);
            }

            const confirmBtn = [...modal.querySelectorAll('button')]
                .find(btn => normalizeText(btn.innerText) === '确定');

            console.log('确定按钮:', confirmBtn);

            if (confirmBtn) {
                await sleep(300);
                realClick(confirmBtn);
                console.log('已点击确定');
                await sleep(800);
            }

        } catch (err) {
            console.error('添加标签失败:', err);
            alert(err.message || '添加标签失败');
        }

        console.groupEnd();
    }

    async function fillBatchOneByOne(list) {
        for (let i = 0; i < list.length; i++) {
            console.group(`【开始处理第 ${i + 1} 条】`);
            console.log('数据:', list[i]);

            const row = await clickAddOneAndGetRow();

            if (!row) {
                console.groupEnd();
                return;
            }

            fillOneRowBasic(row, list[i]);

            await sleep(800);

            await fillTagsForRow(row, list[i].tagsRaw);

            await sleep(800);

            console.groupEnd();
        }

        alert(`完成：共新增 ${list.length} 条`);
    }

    function createUI() {
        if (document.querySelector('#tm-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'tm-panel';

        panel.style = `
            position:fixed;
            top:80px;
            right:20px;
            width:520px;
            background:#fff;
            border:2px solid #1677ff;
            border-radius:10px;
            z-index:999999999;
            box-shadow:0 8px 30px rgba(0,0,0,.3);
            overflow:hidden;
        `;

        panel.innerHTML = `
            <div style="background:#1677ff;color:#fff;padding:10px;font-size:15px;font-weight:bold;">
                终版代码
            </div>

            <div style="padding:12px;">
                <textarea id="tm-textarea"
                    style="width:100%;height:360px;resize:vertical;border:1px solid #999;border-radius:6px;padding:10px;box-sizing:border-box;font-size:13px;line-height:1.5;"
placeholder="格式：

标题:价格:浏览数:购买数:付费内容:标签,颜色,样式 | 标签,颜色,样式

示例：

133期 【王中王】 新澳稳中精准推荐九码🏆🏆🏆:688:143:13:08 19 22 34 36 38 41 43 44:实名认证,红,实心 | 广东联盟推荐,橙,空心

133期 【横财童子】 新澳玄机王牌推荐3码⚡⚡⚡:3999:345:6:09 21 37:实名认证,红,实心 | 神秘高手,橙,实心 | 内幕消息,红,空心"></textarea>

                <button id="tm-start"
                    style="width:100%;height:42px;margin-top:10px;border:none;border-radius:6px;background:#1677ff;color:#fff;font-size:15px;cursor:pointer;">
                    开始逐行新增并填写
                </button>
            </div>
        `;

        document.body.appendChild(panel);

        document.querySelector('#tm-start').onclick = async () => {
            const text = document.querySelector('#tm-textarea').value;
            const list = parseBatchText(text);

            console.log('【输入框原始内容】', text);
            console.log('【解析后的数据列表】', list);

            if (!list.length) {
                alert('请输入内容');
                return;
            }

            await fillBatchOneByOne(list);
        };
    }

    function waitMainPage() {
        const timer = setInterval(() => {
            if (!document.querySelector('#tm-panel')) {
                createUI();
            }
        }, 1000);
    }

    window.addEventListener('load', () => {
        waitMainPage();
    });

    setTimeout(() => {
        if (!document.querySelector('#tm-panel')) {
            createUI();
        }
    }, 1500);

})();
