//. app.js

var express = require( 'express' ),
    basicAuth = require( 'basic-auth-connect' ),
    bodyParser = require( 'body-parser' ),
    cfenv = require( 'cfenv' ),
    ejs = require( 'ejs' ),
    multer = require( 'multer' ),
    fs = require( 'fs' ),
    app = express();
var settings = require( './settings' );
var shiftnum = 5;
var threshhold = 0.85;

var appEnv = cfenv.getAppEnv();

app.use( multer( { dest: './upload/' } ).single( 'csv' ) );
app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.all( '/postcsv*', basicAuth( function( user, pass ){
  return( user === settings.basic_username && pass === settings.basic_password );
}));

app.post( '/correlation', function( req, res ){
  var values = req.body.values;
  var shifts = req.body.shifts;

  //. 文字列 -> 数値
  for( var i = 0; i < values.length; i ++ ){
    for( var j = 0; j < values[i].length; j ++ ){
      values[i][j] = parseFloat( values[i][j] );
    }
  }

  //. shifts 対応
  var max = 0;
  var min = 0;
  for( var i = 0; i < shifts.length; i ++ ){
    shifts[i] = parseInt( shifts[i] );
    if( shifts[i] > max ){
      max = shifts[i];
    }
    if( shifts[i] < min ){
      min = shifts[i];
    }
  }

  var newvalues = [];
  for( var i = 0; i < values.length; i ++ ){
    var newvalue = [];
    for( var j = shifts[i] - min; j < shifts[i] + values[i].length - max; j ++ ){
      newvalue.push( values[i][j] );
    }
    newvalues.push( newvalue );
  }
  values = newvalues;

  //. 各データの相関関係を調べる
  var corrs = [];
  for( var i = 0; i < values.length; i ++ ){
    var corr = [];
    for( var j = 0; j < values.length; j ++ ){
      var c = correlation( values[i], values[j] );
      corr.push( c );
    }
    corrs.push( corr );
  }

  res.write( JSON.stringify( corrs, 2, null ) );
  res.end();
});

app.post( '/postcsv', function( req, res ){
  var originalname = req.file.originalname;
  var path = req.file.path;
  if( originalname.toLowerCase().endsWith( '.csv' ) ){
    fs.readFile( path, function( err, data ){
      fs.unlink( path, function( err ){} );

      //. JSON 配列化
      var v = [];
      var lines = data.toString().split( /\r\n/ ).join( "\n" ).split( /\n/ );
      for( var i = 0; i < lines.length; i ++ ){
        var f = lines[i].split( ',' );
        if( f.length > 1 || f[0] != '' ){
          v.push( f );
        }
      }

      //. 数値が入っている行を探す
      var idx = 0;
      var start = -1;
      var b = true;
      do{
        b = true;
        for( var j = 0; j < v[idx].length && b; j ++ ){
          b = !isNum( v[idx][j] );
        }
        if( b ){
          //. この行は全部文字列
        }else{
          start = idx;
        }

        idx ++;
      }while( b && idx < v.length );

      //. 数値データ取り出し
      var values = [];
      var rownames = [], colnames = [];
      if( start > -1 ){
        //. 数値が入っている列を特定する
        var cols = [];
        for( var j = 0; j < v[start].length; j ++ ){
          if( isNum( v[start][j] ) ){
            cols.push( j );
          }
        }

        //. 数値データだけを取り出す
        //. 最初は行ごとに挿入
        var values0 = [];
        for( var i = start; i < v.length; i ++ ){
          var value = [];
          for( var j = 0; j < cols.length; j ++ ){
            //value.push( v[i][cols[j]] );
            value.push( parseFloat( v[i][cols[j]] ) );
          }
          values0.push( value );
        }
        //. 列ごとのデータに書き換える
        for( var i = 0; i < cols.length; i ++ ){
          var value = [];
          for( var j = 0; j < values0.length; j ++ ){
            value.push( values0[j][i] );
          }
          values.push( value );
        }

        //. 列名を取り出す
        for( var i = 0; i < cols.length; i ++ ){
          var colname = ( start == 0 ) ? generateColName( i ) : v[start-1][cols[i]];
          colnames.push( colname );
        }

        //. 行名を取り出す
        for( var i = start; i < v.length; i ++ ){
          var rowname = ( cols[0] == 0 ) ? ( i - start + 1 ) : v[i][cols[0]-1];
          rownames.push( rowname );
        }

        var template = fs.readFileSync( __dirname + '/public/index.ejs', 'utf-8' );
        var p = ejs.render( template, { values: values, cols: colnames, rows: rownames } );
        res.write( p );
        res.end();
      }

/*
        //. 各データの相関関係を調べる
        var corrs = [];
        for( var i = 0; i < values.length; i ++ ){
          var corr = [];
          for( var j = 0; j < values.length; j ++ ){
            var c = correlation( values[i], values[j] );
            corr.push( c );
          }
          corrs.push( corr );
        }

        //. データをずらしてから相関関係を調べる
        var corrsp = [];
        var corrss = [];
        for( var i = 0; i < values.length; i ++ ){
          var corrp = [];
          var corrm = [];
          for( var j = 0; j < values.length; j ++ ){
            var cp = correlationShift( values[i], values[j], shiftnum );
            var cm = correlationShift( values[i], values[j], -1 * shiftnum );
            corrp.push( cp );
            corrm.push( cm );
          }
          corrsp.push( corrp );
          corrsm.push( corrm );
        }
      }

      var chk = check( corrs, threshhold );
      var chkp = check( corrsp, threshhold );
      var chkm = check( corrsm, threshhold );

      res.write( JSON.stringify( values, 2, null ) );
      res.write( JSON.stringify( corrs, 2, null ) );
      res.write( JSON.stringify( corrsp, 2, null ) );
      res.write( JSON.stringify( corrsm, 2, null ) );
      res.write( JSON.stringify( colnames, 2, null ) );
      res.write( JSON.stringify( rownames, 2, null ) );
      res.end();
*/
    });
  }else{
    fs.unlink( path, function( err ){} );
    res.write( 'Error: not CSV file.' );
    res.end();
  }
});


function isNum( x ){
  var b = ( x.length > 0 );

  for( i = 0; i < x.length && b; i ++ ){
    var c = x.charAt( i );
    b = ( '0' <= c && c <= '9' ) || ( c == '.' ) || ( c == '-' && i == 0 );
  }

  return b;
}

function check( corrs, t ){
  var r = { posi:[], nega:[] };
  var n = corrs.length;
  var tp = Math.abs( t );
  var tm = -1 * tp;

  for( var i = 0; i < n; i ++ ){
    for( var j = 0; j < n; j ++ ){
      if( i != j ){
        var v = corrs[i][j];
        if( v >= tp ){
          r.posi.push( [i,j] );
        }else if( v <= tm ){
          r.nega.push( [i,j] );
        }
      }
    }
  }

  return r;
}

function correlationShift( a, b, num ){
  var n = a.length;
  var newa = [], newb = [];
  if( num > 0 ){
    for( var i = 0; i < n - num; i ++ ){
      newa.push( a[i] );
      newb.push( b[i+num] );
    }
  }else{
    for( var i = 0; i < n - num; i ++ ){
      newa.push( a[i+num] );
      newb.push( b[i] );
    }
  }

  return correlation( newa, newb );
}

function correlation( a, b ){
  var v = 0.0;

//console.log( 'b = ' + JSON.stringify( b ) );
  if( ( a instanceof Array ) && ( b instanceof Array ) && a.length == b.length ){
    var n = a.length;

    //. AVG(a)
    var avg_a = 0.0;
    for( var i = 0; i < n; i ++ ){
      avg_a += a[i];
    }
    avg_a /= n;
//console.log( 'avg_a = ' + avg_a );

    //. AVG(b)
    var avg_b = 0.0;
    for( var i = 0; i < n; i ++ ){
      avg_b += b[i];
    }
    avg_b /= n;
//console.log( 'avg_b = ' + avg_b );

    //. STD(a)
    var std_a = 0.0;
    for( var i = 0; i < n; i ++ ){
      std_a += ( a[i] - avg_a ) * ( a[i] - avg_a );
    }
    std_a /= n;  //. VAR(a)
    std_a = Math.sqrt( std_a );
//console.log( 'std_a = ' + std_a );

    //. STD(b)
    var std_b = 0.0;
    for( var i = 0; i < n; i ++ ){
      std_b += ( b[i] - avg_b ) * ( b[i] - avg_b );
    }
    std_b /= n;  //. VAR(b)
    std_b = Math.sqrt( std_b );
//console.log( 'std_b = ' + std_b );

    //. COVAR(a,b)
    var covar_ab = 0.0;
    for( var i = 0; i < n; i ++ ){
      covar_ab += ( a[i] - avg_a ) * ( b[i] - avg_b );
    }
    covar_ab /= n;
//console.log( 'covar_ab = ' + covar_ab );

    //. CORR(a,b)
    v = covar_ab / ( std_a * std_b );
//console.log( 'v = ' + v );
//console.log( '' );
  }

  return v;
}

function generateColName( x ){
  var name = "";
  var acode = "A".charCodeAt( 0 );

  //. x を 26 進法で表現する
  var b26 = changeBaseNum( x, 26 );
  for( i = 0; i < b26.length; i ++ ){
    name += String.fromCharCode( acode + b26[i] );
  }

  return name;
}

function changeBaseNum( decnum, basenum ){
  var r = [];

  if( decnum > 0 ){
    do{
      var m = decnum % basenum;
      r.unshift( m );
    
      decnum = Math.floor( decnum / basenum );
    }while( decnum > 0 );
  }

  return r;
}

app.listen( appEnv.port );
console.log( "server stating on " + appEnv.port + " ..." );

