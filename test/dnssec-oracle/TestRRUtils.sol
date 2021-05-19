pragma solidity ^0.8.4;

import "../../contracts/dnssec-oracle/RRUtils.sol";
import "../../contracts/dnssec-oracle/BytesUtils.sol";

contract TestRRUtils {
  using BytesUtils for *;
  using RRUtils for *;

  uint16 constant DNSTYPE_A = 1;
  uint16 constant DNSTYPE_CNAME = 5;
  uint16 constant DNSTYPE_MX = 15;
  uint16 constant DNSTYPE_TEXT = 16;
  uint16 constant DNSTYPE_RRSIG = 46;
  uint16 constant DNSTYPE_NSEC = 47;
  uint16 constant DNSTYPE_TYPE1234 = 1234;

  function testNameLength() public pure {
    require(hex'00'.nameLength(0) == 1, "nameLength('.') == 1");
    require(hex'0361626300'.nameLength(4) == 1, "nameLength('.') == 1");
    require(hex'0361626300'.nameLength(0) == 5, "nameLength('abc.') == 5");
  }

  function testLabelCount() public pure {
    require(hex'00'.labelCount(0) == 0, "labelCount('.') == 0");
    require(hex'016100'.labelCount(0) == 1, "labelCount('a.') == 1");
    require(hex'016201610000'.labelCount(0) == 2, "labelCount('b.a.') == 2");
    require(hex'066574686c61620378797a00'.labelCount(6 +1) == 1, "nameLength('(bthlab).xyz.') == 6");
  }

  function testIterateRRs() public pure {
    // a. IN A 3600 127.0.0.1
    // b.a. IN A 3600 192.168.1.1
    bytes memory rrs = hex'0161000001000100000e1000047400000101620161000001000100000e100004c0a80101';
    string[2] memory names = [hex'016100', hex'0162016100'];
    string[2] memory rdatas = [hex'74000001', hex'c0a80101'];
    uint i = 0;
    for(RRUtils.RRIterator memory iter = rrs.iterateRRs(0); !iter.done(); iter.next()) {
      require(uint(iter.dnstype) == 1, "Type matches");
      require(uint(iter.class) == 1, "Class matches");
      require(uint(iter.ttl) == 3600, "TTL matches");
      require(keccak256(iter.name()) == keccak256(bytes(names[i])), "Name matches");
      require(keccak256(iter.rdata()) == keccak256(bytes(rdatas[i])), "Rdata matches");
      i++;
    }
    require(i == 2, "Expected 2 records");
  }

  function testCheckTypeBitmapTextType() public pure {
    bytes memory tb = hex'0003000080';
    require(tb.checkTypeBitmap(0, DNSTYPE_TEXT) == true, "A record should exist in type bitmap");
  }

  function testCheckTypeBitmap() public pure {
    // From https://tools.ietf.org/html/rfc4034#section-4.3
    //    alfa.example.com. 86400 IN NSEC host.example.com. (
    //                               A MX RRSIG NSEC TYPE1234
    bytes memory tb = hex'FF0006400100000003041b000000000000000000000000000000000000000000000000000020';

    // Exists in bitmap
    require(tb.checkTypeBitmap(1, DNSTYPE_A) == true, "A record should exist in type bitmap");
    // Does not exist, but in a window that is included
    require(tb.checkTypeBitmap(1, DNSTYPE_CNAME) == false, "CNAME record should not exist in type bitmap");
    // Does not exist, past the end of a window that is included
    require(tb.checkTypeBitmap(1, 64) == false, "Type 64 should not exist in type bitmap");
    // Does not exist, in a window that does not exist
    require(tb.checkTypeBitmap(1, 769) == false, "Type 769 should not exist in type bitmap");
    // Exists in a subsequent window
    require(tb.checkTypeBitmap(1, DNSTYPE_TYPE1234) == true, "Type 1234 should exist in type bitmap");
    // Does not exist, past the end of the bitmap windows
    require(tb.checkTypeBitmap(1, 1281) == false, "Type 1281 should not exist in type bitmap");
  }

  // Canonical ordering https://tools.ietf.org/html/rfc4034#section-6.1
  function testCompareNames() public pure {
    bytes memory bthLabXyz = hex'066274686c61620378797a00';
    bytes memory ethLabXyz = hex'066574686c61620378797a00';
    bytes memory xyz = hex'0378797a00';
    bytes memory a_b_c  = hex'01610162016300';
    bytes memory b_b_c  = hex'01620162016300';
    bytes memory c      = hex'016300';
    bytes memory d      = hex'016400';
    bytes memory a_d_c  = hex'01610164016300';
    bytes memory b_a_c  = hex'01620161016300';
    bytes memory ab_c_d = hex'0261620163016400';
    bytes memory a_c_d  = hex'01610163016400';

    require(hex'0301616100'.compareNames(hex'0302616200') <  0,  "label lengths are correctly checked");
    require(a_b_c.compareNames(c)      >  0,  "one name has a difference of >1 label to with the same root name");
    require(a_b_c.compareNames(d)      <  0, "one name has a difference of >1 label to with different root name");
    require(a_b_c.compareNames(a_d_c)  <  0, "two names start the same but have differences in later labels");
    require(a_b_c.compareNames(b_a_c)  >  0, "the first label sorts later, but the first label sorts earlier");
    require(ab_c_d.compareNames(a_c_d) >  0, "two names where the first label on one is a prefix of the first label on the other");
    require(a_b_c.compareNames(b_b_c)  <  0, "two names where the first label on one is a prefix of the first label on the other");
    require(xyz.compareNames(ethLabXyz) < 0, "xyz comes before ethLab.xyz");
    require(bthLabXyz.compareNames(ethLabXyz) < 0, "bthLab.xyz comes before ethLab.xyz");
    require(bthLabXyz.compareNames(bthLabXyz) == 0, "bthLab.xyz and bthLab.xyz are the same");
    require(ethLabXyz.compareNames(bthLabXyz) >  0, "ethLab.xyz comes after bethLab.xyz");
    require(bthLabXyz.compareNames(xyz)       >  0, "bthLab.xyz comes after xyz");
  }

  function testSerialNumberGt() public pure {
    require(RRUtils.serialNumberGte(1, 0), "1 >= 0");
    require(!RRUtils.serialNumberGte(0, 1), "!(0 <= 1)");
    require(RRUtils.serialNumberGte(0, 0xFFFFFFFF), "0 >= 0xFFFFFFFF");
    require(!RRUtils.serialNumberGte(0xFFFFFFFF, 0), "!(0 <= 0xFFFFFFFF)");
    require(RRUtils.serialNumberGte(0x11111111, 0xAAAAAAAA), "0x11111111 >= 0xAAAAAAAA");
    require(RRUtils.serialNumberGte(1, 1), "1 >= 1");
  }
}