/**
 * ScraperController.js 
 *
 * @description ::
 * @docs        :: http://sailsjs.org/#!documentation/controllers
 */

module.exports = {
	diputados: function(req, res) {
		var cheerio = require('cheerio');
		var request = require('request');
		var iconv = require('iconv-lite');
		var partido = req.param('id');
		request.get({
			uri: 'http://sitl.diputados.gob.mx/LXII_leg/listado_diputados_gpnp.php?tipot='+partido,
			encoding: null
		},function(err, resp, body) {
			if (err) throw err;
			body = iconv.decode(body, 'iso-8859-1');
			var $ = cheerio.load(body);
			$('.linkVerde').each(function(){
				diputado = {
					"id" : $(this).attr('href').replace('curricula.php?dipt=',''),
					"nombre" : $(this).text().split(' ').splice(1).join(' '),
					"entidad" : $(this).parent().next().text(),
					"partido" : partido
				}
				Diputado.create(diputado).done(function(err, user){
					if (err) return console.log(err);
				});
			});
			Diputado.find({}).done(function(err, diputados){
				res.json(diputados);	
			});
		});
	},
	curricula : function(req,res){
		var cheerio = require('cheerio');
		var request = require('request');
		var iconv = require('iconv-lite');
		Diputado.find({}).done(function(err, diputados){
			if(err) throw err;
			diputados.forEach(function(diputado){
				request.get({
					uri : 'http://sitl.diputados.gob.mx/LXII_leg/curricula.php?dipt='+diputado.id,
					encoding : null, 
				},function(err, resp, body){
					if(err) throw err;
					body = iconv.decode(body, 'iso-8859-1');			
					var $ = cheerio.load(body);
					var bodySummary = $('body').text().replace(/[\n|\t| ]+/gi,' ');
					var dchelper = bodySummary.match(/(Distrito|Circunscripción): (.*) Cabecera:/i);
					var suplente = bodySummary.match(/Suplente( de)?: (.*) Onomástico:/i);
					var email = bodySummary.match(/([0-9a-zA-Z]([-\.\w]*[0-9a-zA-Z])*@([0-9a-zA-Z][-\w]*[0-9a-zA-Z]\.)+[a-zA-Z]{2,9})/i);

					if(suplente){
						if(suplente[1] == ' de'){
							diputado.suplente_de = suplente[2];
							diputado.propietario = false;
						}else{
							diputado.suplente = suplente[2];
							diputado.propietario = true;
						}						
					}else{
						console.log('suplente error:'+diputado.id);
					}					
					if(dchelper){
						diputado[dchelper[1].toLowerCase()] = dchelper[2];
					}else{
						console.log('curul error:'+diputado.id);
					}

					diputado.email = email ? email[0] : false;
					diputado.curul = bodySummary.match( /Curul: (.*) (Suplente( de)?|Onomástico):/i)[2];
					diputado.tipo_de_eleccion = bodySummary.match( /Tipo de elección: (.*) Entidad:/i)[1];
					diputado.save(function(err,diputado){
						if(err) throw err;
						//Comisiones	
						var comisiones = $('body').html().match(/<a href="integrantes_de_comisionlxii.php\?comt=(\d*)"[^>]*>([^<]*)<\/a>/ig);
						if(comisiones){
							comisiones.forEach(function(comision){
								comision = comision.match(/<a href="integrantes_de_comisionlxii.php\?comt=(\d*)"[^>]*>([^<]*)<\/a>/i);
								Comision.findOrCreate({id:comision},{id:comision[1],nombre:comision[2].trim()}).populate('diputados').exec(function(e,c){
									if(e) throw (e);
									c.diputados.add(diputado.id)
									c.save();
								});
							});
						}else{
							console.log('diputado sin comisiones: '+diputado.id);
						}
					});
				});
			});
			console.log('jobs done');
		});
	}

};
