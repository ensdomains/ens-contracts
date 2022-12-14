

rule sanity(method f) {
    calldataarg args;
    env e;

    f(e,args);
    assert false; 
}