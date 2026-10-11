(() => {
 const send=()=>window.parent.postMessage({type:'md-sales-height',height:Math.max(260,document.body.scrollHeight)},'https://liniers.xn--somosmasdueos-skb.com');
 new ResizeObserver(send).observe(document.body);
 send();
})();
