let tokenIssuanceTimer;
let tokenIssuanceCanceled;

$(function () {
    if (!chatClient.isAvailable()) {
        return;
    }
    $(".language-settings .button.ok").on("click", function () {
        $(".choose-info").hide();
        $(".language-settings .guide").show();
        $(".language-settings .form-error").hide();
        let nativeLang = $(".language-settings select[name=native_lang]").val();
        let convoLang = $(".language-settings select[name=convo_lang]").val();
        if (!nativeLang || !convoLang) {
            $(".language-settings .form-error.exchange-languages-required").fadeIn();
            return;
        }
        if (nativeLang === convoLang) {
            $(".language-settings .form-error.same-exchange-languages").fadeIn();
            localStorage.removeItem("convoLang");
            return;
        }
        localStorage.setItem("nativeLang", nativeLang);
        localStorage.setItem("convoLang", convoLang);
        let params = {
            native_lang: nativeLang,
            convo_lang: convoLang
        }
        chatClient.closeSocket();
        startExchangeChat(params)
    });
    let storedNativeLang = localStorage.getItem("nativeLang")||userInfo.language;
    let storedConvoLang = localStorage.getItem("convoLang");
    $(".language-settings select[name=native_lang] option").filter(function () {
        return $(this).val() === storedNativeLang;
    }).each(function () {
        $(".language-settings select[name=native_lang]").val(storedNativeLang);
    });
    $(".language-settings select[name=convo_lang] option").filter(function () {
        return $(this).val() === storedConvoLang;
    }).each(function () {
        $(".language-settings select[name=convo_lang]").val(storedConvoLang);
    });
    if (storedNativeLang && storedConvoLang) {
        $(".language-settings .button.ok").click();
    }
});

function startExchangeChat(params) {
    if (tokenIssuanceTimer) {
        tokenIssuanceCanceled = true;
        clearTimeout(tokenIssuanceTimer);
    }
    tokenIssuanceCanceled = false;
    tokenIssuanceTimer = setTimeout(function () {
        $.ajax({
            url: "/exchange/request",
            data: params,
            method: 'GET',
            dataType: 'json',
            success: function (response) {
                if (response) {
                    if (!tokenIssuanceCanceled) {
                        switch (response.error) {
                            case -1:
                                chatClient.reloadPage();
                                break;
                            case -2:
                                $(".language-settings .form-error").hide();
                                $(".language-settings .form-error.exchange-languages-required").fadeIn();
                                break;
                            case 0:
                                hideSidebar();
                                chatClient.openSocket(response.token, params);
                                $(".choose-info").fadeIn();
                                $(".language-settings .guide").hide();
                        }
                    }
                } else {
                    chatClient.serviceNotAvailable();
                }
            },
            error: function () {
                chatClient.serviceNotAvailable();
            }
        });
    }, 600);
    hideSidebar();
    chatClient.clearChaters();
    chatClient.clearConvo();
}