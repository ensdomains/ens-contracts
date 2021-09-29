function isException(error, msg) {
    let strError = error.toString();    
    if(msg){
        return strError.match(msg)
    }else{
        strError.includes('invalid opcode') || strError.includes('invalid JUMP') || strError.includes('revert');
    }
}

function ensureException(error, msg) {
    assert(isException(error, msg), error.toString());
}

async function expectFailure(call, msg) {
    try {
        await call;
    } catch (error) {
        return ensureException(error, msg)
    }

    assert.fail("should fail")
}

module.exports = {
    ensureException: ensureException,
    expectFailure: expectFailure
}
