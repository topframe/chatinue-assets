function ChatClientCore(chatClientSettings) {
    let chatClient = this;
    let available = false;
    let socket;
    let heartbeatTimer;
    let heartbeatCount = 0;
    let pendedMessages;
    let frequentlySentCount = 0;
    let chatAborted;
    let justStayHere;

    this.init = function (extender) {
        if (!Modernizr.websockets || detectIE()) {
            chatClient.gotoHome();
            return false;
        }
        if (extender) {
            extender(this);
        }
        $("button.sign-out").off().click(function () {
            $("button.sign-out").prop("disabled", true);
            chatClient.closeSocket();
            setTimeout(function () {
                location.href = "/sign-out";
            }, 900);
        });
        $("button.leave").on("click", function () {
            $("button.leave").prop("disabled", true);
            chatClient.closeSocket();
            setTimeout(function () {
                chatClient.leaveChat();
            }, 500);
        });
        $("#contacts").on("click", ".contact", function () {
            $(".aboutMe", this).toggle();
        }).on("mouseleave", ".contact", function () {
            $(".aboutMe", this).hide();
        });
        $("#convo").on("click", ".message.event.group .more", function () {
            $(this).parent().toggleClass("all-visible");
        });
        $("#message").on("focusin", function () {
            hideSidebar();
        });
        $("#form-send-message").submit(function () {
            if (!socket || !$("#message").val()) {
                return false;
            }
            if (frequentlySentCount > 1) {
                return false;
            }
            $("#for-automata-clear").focus();
            if (userInfo.userId) {
                chatClient.sendMessage();
            }
            frequentlySentCount++;
            $("#form-send-message button.send").addClass("busy");
            if (isTouchDevice()) {
                $("#form-send-message button.send").focus().blur();
            }
            setTimeout(function () {
                $("#form-send-message button.send").removeClass("busy");
            }, 500);
            setTimeout(function () {
                frequentlySentCount--;
            }, 1000);
            return false;
        });
        if (chatClientSettings.talkerToken && chatClientSettings.autoConnectEnabled !== false) {
            setTimeout(function () {
                chatClient.openSocket(chatClientSettings.talkerToken);
            }, 300);
        }
        available = true;
        return true;
    };

    this.isAvailable = function () {
        return available;
    };

    this.openSocket = function (token, params) {
        if (!token) {
            chatClient.gotoHome();
            return;
        }
        chatClient.closeSocket();
        let url = new URL(chatClientSettings.serverEndpoint + token + location.search, location.href);
        if (params) {
            for (let key in params) {
                url.searchParams.set(key, params[key]);
            }
        }
        url.protocol = url.protocol.replace('https:', 'wss:');
        url.protocol = url.protocol.replace('http:', 'ws:');
        socket = new WebSocket(url.href);
        socket.onopen = function (event) {
            chatClient.heartbeatPing();
        };
        socket.onmessage = function (event) {
            if (typeof event.data === "string") {
                let chatMessage = deserialize(event.data);
                console.log(chatMessage);
                chatClient.handleMessage(chatMessage);
            }
        };
        socket.onclose = function (event) {
            if (event.code === 1008 && event.reason === "redundant") {
                chatClient.redundantJoin();
            } else {
                chatClient.closeSocket();
                chatClient.checkConnection(100);
            }
        };
        socket.onerror = function (event) {
            console.error("WebSocket error observed:", event);
            chatClient.closeSocket();
            chatClient.checkConnection(100);
        };
    };

    this.heartbeatPing = function () {
        if (heartbeatTimer) {
            clearTimeout(heartbeatTimer);
        }
        heartbeatTimer = setTimeout(function () {
            if (socket) {
                console.log('Sending heartbeat ping');
                let chatMessage = {
                    heartbeat: "ping"
                };
                chatClient.sendMessage(serialize(chatMessage));
                chatClient.heartbeatPing();
                if (chatClientSettings.pingPerHeartbeats) {
                    heartbeatCount++;
                    if (heartbeatCount % chatClientSettings.pingPerHeartbeats === 0) {
                        console.log('Sending deep heartbeat ping');
                        $.ajax({
                            url: '/ping',
                            type: 'get',
                            dataType: 'text',
                            success: function (result) {
                                if (result !== "pong") {
                                    chatClient.leaveChat();
                                }
                            },
                            error: function () {
                                chatClient.leaveChat();
                            }
                        });
                    }
                }
            }
        }, 57000);
    };

    this.checkConnection = function (delay) {
        setTimeout(function () {
            $.ajax({
                url: '/ping',
                type: 'get',
                dataType: 'text',
                timeout: 30000,
                success: function (result) {
                    if (result === "pong" && !chatAborted) {
                        chatClient.reloadPage();
                    } else {
                        chatClient.gotoHome();
                    }
                },
                error: function () {
                    let retries = $("#common-connection-lost").data("retries") || 0;
                    $("#common-connection-lost").data("retries", retries + 1);
                    if (retries === 0) {
                        $("#common-connection-lost").foundation('open');
                    } else if (retries > 25) {
                        console.log("Abandon reconnection");
                        return;
                    }
                    console.log(retries + " retries");
                    chatClient.checkConnection(2000 * retries);
                }
            });
        }, delay);
    };

    this.closeSocket = function () {
        if (socket) {
            socket.onclose = null;
            socket.close();
            socket = null;
        }
    };

    this.leaveChat = function () {
        chatClient.closeSocket();
        chatClient.gotoHome();
    };

    this.handleMessage = function (incomingMessage) {
        if (pendedMessages) {
            pendedMessages.push(incomingMessage);
            return;
        }
        Object.entries(incomingMessage).forEach(([messageType, payload]) => {
            if (payload) {
                switch (messageType) {
                    case "heartbeat": {
                        if (payload === "pong") {
                            chatClient.heartbeatPing();
                        }
                        break;
                    }
                    case "broadcast": {
                        chatClient.printMessage(payload);
                        break;
                    }
                    case "notice": {
                        chatClient.handelNotice(payload);
                        break;
                    }
                    case "userJoined": {
                        chatClient.addTalker(deserialize(payload.talker));
                        chatClient.printUserJoinedMessage(payload);
                        break;
                    }
                    case "userLeft": {
                        chatClient.removeTalker(payload.userId);
                        chatClient.printUserLeftMessage(payload);
                        break;
                    }
                    case "join": {
                        pendedMessages = [];
                        chatClient.setTalkers(payload.talkers);
                        let talker = deserialize(payload.talker);
                        chatClient.addTalker(talker);
                        if (payload.convo) {
                            chatClient.printRecentConvo(payload.convo.reverse());
                        }
                        chatClient.printJoinMessage(talker);
                        while (pendedMessages && pendedMessages.length > 0) {
                            chatClient.handleMessage(pendedMessages.pop());
                        }
                        pendedMessages = null;
                        break;
                    }
                }
            }
        });
    };

    this.handelNotice = function (payload) {
        console.log(payload);
        switch (payload.type) {
            case "chatMsgDeleted": {
                let msgId = payload.text;
                let balloon = $("#convo #msg-" + msgId);
                let icon = $("<i class='iconfont fi-trash not-supported'></i>")
                    .attr("title", "This message has been deleted.");
                balloon.empty().append(icon);
                break;
            }
            case "chatDeleted": {
                chatClient.chatDeleted();
                break;
            }
        }
    };

    this.readyToType = function (select) {
        if (select) {
            $("#message").focus().select();
        } else {
            $("#message").focus();
        }
    };

    this.sendMessage = function (text) {
        if (text) {
            socket.send(text);
            return;
        }
        let $msg = $("#message");
        let val = $msg.val().trim();
        if (val) {
            let message = {
                text: val
            };
            $msg.val('');
            socket.send(serialize(message));
            $msg.focus();
        }
    };

    this.setTalkers = function (talkers) {
        if (talkers) {
            console.log("talkers", talkers);
            for (let i in talkers) {
                let text = talkers[i];
                console.log("addTalker", text);
                console.log(deserialize(text));
                chatClient.addTalker(deserialize(text));
            }
            chatClient.updateTotalPeople();
        }
    };

    this.addTalker = function (talker) {
        let contact = $("<li class='contact'/>")
            .data("user-id", talker.userId)
            .data("user-name", talker.userName)
            .data("color", talker.color);
        let status = $("<div/>").addClass("status");
        if (talker.color) {
            status.addClass("my-col-" + talker.color);
        }
        let badge = $("<i class='iconfont fi-mountains'/>");
        let name = $("<p class='name'/>").text(talker.userName);
        contact.append(status.append(badge)).append(name);
        if (talker.aboutMe) {
            let aboutMe = $("<p class='aboutMe'/>").text(talker.aboutMe);
            contact.append(aboutMe);
            contact.addClass("has-aboutMe");
        }
        contact.appendTo($("#contacts"));
        if (talker.country) {
            let flag = $("<img class='flag'/>");
            flag.attr("src", chatClientSettings.cdnAssetsUrl +
                "/flags/" + talker.country.toLowerCase() + ".svg");
            flag.attr("title", talker.country);
            contact.append(flag);
        }
        if (userInfo.userId === talker.userId) {
            contact.addClass("me");
        }
        chatClient.updateTotalPeople();
    };

    this.removeTalker = function (id) {
        chatClient.findUser(id).remove();
        chatClient.updateTotalPeople();
    };

    this.findUser = function (userId) {
        return $("#contacts .contact")
            .filter(function () {
                return ($(this).data("user-id") === userId);
            });
    };

    this.clearTalkers = function () {
        $("#contacts").empty();
        chatClient.updateTotalPeople();
    };

    this.clearConvo = function () {
        $("#convo").empty();
    };

    this.removeConvoMessages = function () {
        $("#convo .message").remove();
    };

    this.getTotalPeople = function () {
        return $("#contacts .contact").length;
    };

    this.updateTotalPeople = function () {
        let total = chatClient.getTotalPeople();
        if (total) {
            $("#totalPeople").text(total).fadeIn();
        } else {
            $("#totalPeople").text("").hide();
        }
    };

    this.printJoinMessage = function (talker, restored) {
        let welcomeMsg = replaceMessageArguments(chatClientMessages.welcome,
            "name", talker.userName);
        chatClient.printEventMessage(welcomeMsg, restored);
    };

    this.printUserJoinedMessage = function (payload, restored) {
        chatClient.printUserEvent(payload, "user-joined", restored);
    };

    this.printUserLeftMessage = function (payload, restored) {
        chatClient.printUserEvent(payload, "user-left", restored);
    };

    this.printUserEvent = function (payload, event, restored) {
        let convo = $("#convo");
        let last = convo.find(".message").last();
        let container = null;
        if (last.length) {
            let userId = last.data("user-id");
            if (last.hasClass("event") && payload.userId === userId) {
                container = last;
            }
        }
        let talker = deserialize(payload.talker);
        let content = $("<p class='content'/>").addClass(event).data("event", event);
        switch (event) {
            case "user-joined":
                content.append(replaceMessageArguments(chatClientMessages.userJoined,
                    "name", talker.userName));
                break;
            case "user-left":
                content.append(replaceMessageArguments(chatClientMessages.userLeft,
                    "name", talker.userName));
                break;
            default:
                console.error("Unknown user event: " + event);
                return;
        }
        if (payload.datetime) {
            let datetime = moment.utc(payload.datetime).local().format("L LT");
            content.append("<span class='datetime'>" + datetime + "</span>");
        }
        if (container) {
            let contents = container.find(".content");
            if (contents.length >= 30) {
                contents.first().remove();
            }
            container.addClass("group").append(content);
            contents = container.find(".content").addClass("omitted");
            let first = contents.first();
            let last = contents.last();
            if (first.data("event") !== last.data("event")) {
                first.removeClass("omitted");
            }
            last.removeClass("omitted");
            if (contents.length > 2) {
                let more = container.find(".more");
                if (more.length > 0) {
                    more.attr("title", contents.length)
                } else {
                    $("<i class='more fi-indent-more'></i>")
                        .attr("title", contents.length).insertAfter(first);
                }
            }
        } else {
            let message = $("<div class='message event'/>")
                .data("user-id", payload.userId)
                .append(content);
            if (!restored && talker.aboutMe && event === "user-joined") {
                let selfIntro = $("<p class='about-me'/>").text(talker.aboutMe);
                if (talker.color) {
                    selfIntro.addClass("my-col-" + talker.color);
                }
                message.append(selfIntro);
            }
            convo.append(message);
        }
        if (!restored) {
            chatClient.scrollToBottom(convo);
        }
    };

    this.printMessage = function (payload, restored) {
        let talker = deserialize(payload.talker);
        let mine = (userInfo.userId === talker.userId);
        let convo = $("#convo");
        let content = $("<p class='content'/>");
        let balloon = $("<span class='balloon' id='msg-" + payload.id + "'/>");
        if (payload.file) {
            $("<i class='iconfont fi-photo not-supported'></i>")
                .attr("title", "Sorry. Photos are only visible on the mobile app.")
                .appendTo(balloon);
            if (payload.text) {
                balloon.append($("<span/>").text(payload.text));
            }
        } else {
            balloon.text(payload.text);
        }
        content.append(balloon);
        if (payload.datetime) {
            let datetime = moment.utc(payload.datetime).local();
            let hours = moment.duration(moment().diff(datetime)).asHours();
            let $datetime = $("<span class='datetime'/>")
                .text(datetime.format(hours < 24 ? "LTS" : "L LT"));
            if (mine) {
                content.append($datetime);
            } else {
                content.append($datetime);
            }
        }
        let last = convo.find(".message").last();
        if (last.length && !last.hasClass("event") && last.data("user-id") === talker.userId) {
            if (restored) {
                last.addClass("restored");
            }
            last.append(content);
        } else {
            let sender = $("<span class='name'/>").text(talker.userName);
            let message = $("<div class='message'/>")
                .addClass(mine ? "sent" : "received")
                .data("user-id", talker.userId)
                .data("user-name", talker.userName)
                .append(sender).append(content);
            if (restored) {
                message.addClass("restored");
            } else if (talker.color) {
                message.addClass("my-col-" + talker.color);
            }
            convo.append(message);
        }
        if (!restored) {
            chatClient.scrollToBottom(convo);
        }
    };

    this.printEventMessage = function (html, restored) {
        let convo = $("#convo");
        let content = $("<p class='content'/>").html(html);
        $("<div class='message event'/>")
            .append(content)
            .appendTo(convo);
        if (!restored) {
            chatClient.scrollToBottom(convo);
        }
    };

    this.printCustomMessage = function (html) {
        let convo = $("#convo");
        $("<div class='message custom'/>")
            .append(html)
            .appendTo(convo);
        chatClient.scrollToBottom(convo);
    };

    this.printRecentConvo = function (incomingMessages) {
        for (let incomingMessage of incomingMessages) {
            Object.entries(incomingMessage).forEach(([messageType, payload]) => {
                if (payload) {
                    switch (messageType) {
                        case "broadcast": {
                            chatClient.printMessage(payload, true);
                            break;
                        }
                        case "userJoined": {
                            chatClient.printUserJoinedMessage(payload, true);
                            break;
                        }
                        case "userLeft": {
                            chatClient.printUserLeftMessage(payload, true);
                            break;
                        }
                    }
                }
            });
        }
        chatClient.scrollToBottom($("#convo"), false);
    };

    this.redundantJoin = function () {
        justStayHere = true;
        chatClient.clearTalkers();
        chatClient.clearConvo();
        chatClient.closeSocket();
        $("#chat-redundant-join").foundation('open');
    };

    this.scrollToBottom = function (container, animate) {
        if (animate) {
            container.animate({scrollTop: container.prop("scrollHeight")});
        } else {
            container.scrollTop(container.prop("scrollHeight"));
        }
    };

    this.reloadPage = function () {
        location.reload();
    };

    this.gotoHome = function () {
        if (chatClientSettings.homepage) {
            location.href = chatClientSettings.homepage;
        }
    };

    this.serviceUnavailable = function () {
        openNoticePopup(
            chatClientMessages.systemError,
            chatClientMessages.serviceUnavailable,
            function () {
                chatClient.gotoHome();
            });
    };

    this.chatDeleted = function () {
        if (chatClientSettings.chatId > 0) {
            $("#public-chat-deleted").foundation('open');
        }
    };
}
